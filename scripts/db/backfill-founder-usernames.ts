import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { founderUsernamePattern, usernameFromName } from "../../src/modules/founders/paths";

type Founder = { id: string; slug: string; name: string; visibility: string; updated_at: Date | string };
type Alias = { slug: string; founder_id: string };
type Snapshot = { founders: Founder[]; aliases: Alias[] };
type Plan = { version: 1; database: string; actorUserId: string; snapshotHash: string; changes: { founderId: string; from: string; to: string; publicName: string }[] };
const reserved = new Set(["me", "new", "edit", "admin", "api", "settings", "undefined", "null"]);
const legacy = /^legacy-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

/** Uses only names already explicitly published; private identities remain unchanged. */
export function planFounderUsernames(database: string, actorUserId: string, snapshot: Snapshot): Plan {
  const founders = [...snapshot.founders].sort((a, b) => a.id.localeCompare(b.id));
  const aliases = [...snapshot.aliases].sort((a, b) => a.slug.localeCompare(b.slug));
  const used = new Set([...founders.map(row => row.slug), ...aliases.map(row => row.slug)]);
  const changes: Plan["changes"] = [];
  for (const founder of founders) {
    if (founder.visibility !== "public" || !legacy.test(founder.slug)) continue;
    const base = usernameFromName(founder.name.includes("@") ? "" : founder.name);
    let slug = base, suffix = 1;
    while (used.has(slug) || reserved.has(slug)) slug = `${base}-${++suffix}`;
    if (!founderUsernamePattern.test(slug) || slug.length > 80) throw new Error("Invalid planned username; no changes applied.");
    used.add(slug);
    changes.push({ founderId: founder.id, from: founder.slug, to: slug, publicName: founder.name });
  }
  return { version: 1, database, actorUserId, snapshotHash: digest({ founders, aliases }), changes };
}

export async function backfillFounderUsernames(options: { databaseUrl: string; expectedDatabase: string; actorUserId: string; planPath: string; confirmDigest?: string }) {
  const address = new URL(options.databaseUrl);
  if (!["postgres:", "postgresql:"].includes(address.protocol) || decodeURIComponent(address.pathname.slice(1)) !== options.expectedDatabase
    || ["postgres", "template0", "template1"].includes(options.expectedDatabase)) throw new Error("Explicit application database does not match; no changes applied.");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.actorUserId)) throw new Error("Explicit administrator UUID is required.");
  const sql = postgres(options.databaseUrl, { max: 1, onnotice: () => undefined,
    connection: { application_name: "thefastestweb-founder-url-backfill", statement_timeout: 30_000, lock_timeout: 10_000 } });
  try {
    let approved: Plan | undefined;
    if (options.confirmDigest) {
      approved = JSON.parse(await readFile(options.planPath, "utf8")) as Plan;
      if (approved.version !== 1 || approved.database !== options.expectedDatabase || approved.actorUserId !== options.actorUserId || digest(approved) !== options.confirmDigest)
        throw new Error("Plan or confirmation digest changed; no changes applied.");
    }
    const result = await sql.begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended('founder-username-namespace',0))`;
      const [actor] = await tx`SELECT user_id FROM public.admin_roles WHERE user_id=${options.actorUserId} AND role='admin' FOR SHARE`;
      if (!actor) throw new Error("The specified actor is not a current administrator; no changes applied.");
      if (approved) {
        // Serialize changes from earlier deployed versions that do not take the namespace lock.
        await tx`LOCK TABLE public.founders, public.founder_slug_aliases IN SHARE ROW EXCLUSIVE MODE`;
      }
      const founders = await tx<Founder[]>`SELECT id,slug,name,visibility,updated_at FROM public.founders ORDER BY id`;
      const aliases = await tx<Alias[]>`SELECT slug,founder_id FROM public.founder_slug_aliases ORDER BY slug`;
      const plan = planFounderUsernames(options.expectedDatabase, options.actorUserId, { founders, aliases });
      if (!approved) return { plan, applied: false };
      if (digest(plan) !== options.confirmDigest) throw new Error("Founder namespace changed since preview; create and review a new plan.");
      for (const change of plan.changes) {
        await tx`INSERT INTO public.founder_slug_aliases(slug,founder_id) VALUES (${change.from},${change.founderId}) ON CONFLICT DO NOTHING`;
        const [oldAlias] = await tx`SELECT founder_id FROM public.founder_slug_aliases WHERE slug=${change.from}`;
        if (oldAlias?.founder_id !== change.founderId) throw new Error("Existing alias belongs to another profile; no changes applied.");
        await tx`INSERT INTO public.founder_slug_aliases(slug,founder_id) VALUES (${change.to},${change.founderId})`;
        const updated = await tx`UPDATE public.founders SET slug=${change.to},updated_at=now()
          WHERE id=${change.founderId} AND slug=${change.from} AND visibility='public' RETURNING id`;
        if (updated.length !== 1) throw new Error("Profile publication state changed; no changes applied.");
        await tx`INSERT INTO public.audit_logs(id,actor_user_id,action,target_type,target_id,reason,payload)
          VALUES (${randomUUID()},${options.actorUserId},'founder.username.backfill','founder',${change.founderId},
          'Owner-authorized maintenance: replace previously public legacy UUID URL with a readable username.',
          ${tx.json({ previousUsername: change.from, username: change.to, planDigest: options.confirmDigest })})`;
      }
      return { plan, applied: true };
    });
    if (!result.applied) await writeFile(options.planPath, JSON.stringify(result.plan, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return { applied: result.applied, profiles: result.plan.changes.length, digest: digest(result.plan) };
  } finally { await sql.end(); }
}

async function main() {
  const values = process.argv.slice(2), args = new Map<string, string>();
  for (let i = 0; i < values.length; i += 2) {
    if (!["--database", "--actor", "--plan", "--confirm-digest"].includes(values[i]) || !values[i + 1] || args.has(values[i])) throw new Error("Invalid operator arguments.");
    args.set(values[i], values[i + 1]);
  }
  const databaseUrl = process.env.MIGRATION_DATABASE_URL, expectedDatabase = args.get("--database"), actorUserId = args.get("--actor"), planPath = args.get("--plan");
  if (!databaseUrl || !expectedDatabase || !actorUserId || !planPath) throw new Error("MIGRATION_DATABASE_URL, --database, --actor and --plan are required.");
  const result = await backfillFounderUsernames({ databaseUrl, expectedDatabase, actorUserId, planPath, confirmDigest: args.get("--confirm-digest") });
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error("Founder URL maintenance stopped safely. Check the reviewed plan, schema, target and namespace; no credentials were printed.");
  process.exitCode = 1;
});
