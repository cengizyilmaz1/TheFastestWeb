import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { prepareIntegrationDatabase, fixtureSql, cleanupIntegrationDatabase } from "../tests/integration/database";

let server: ChildProcess | undefined;
let phase = "prepare-isolated-database";
async function run(args: string[], env = process.env) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error("Validation command failed");
}
async function main() {
try {
  // The fixture helper refuses any non-loopback/non-tfw_test_ target.
  await prepareIntegrationDatabase();
  const sql = fixtureSql(), user = randomUUID(), site = randomUUID(), collaborator = randomUUID(), privateUser = randomUUID(), peer = randomUUID();
  await sql`INSERT INTO users(id,name,email) VALUES(${user},'Synthetic smoke account','smoke@example.invalid')`;
  await sql`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,current_score,last_tested_at)
    VALUES(${site},'synthetic-smoke','Synthetic smoke fixture','https://example.com','https://example.com','Isolated test data only.',${user},'Synthetic smoke account',true,'active',87,now())`;
  await sql`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,lifecycle,current_score,last_tested_at)
    VALUES(${peer},'synthetic-peer','Synthetic comparison fixture','https://example.org','https://example.org','Isolated test data only.',${user},'Synthetic smoke account',true,'active',95,now())`;
  for (const [id, score] of [[site, 87], [peer, 95]] as const) {
    for (const days of [2, 1, 0]) await sql`INSERT INTO speed_tests(site_id,score,strategy,methodology_version,sample_count,metrics_source,fcp_ms,lcp_ms,cls,tbt_ms,si_ms,tested_at)
      VALUES(${id},${score-days*6},'mobile','psi-v2-two-sample',2,'lab',1000,1500,0.02,40,1800,now()-${days}*interval '1 day')`;
  }
  await sql`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${site},id,true FROM categories WHERE slug='saas'`;
  await sql`INSERT INTO users(id,name,email) VALUES(${collaborator},'Synthetic collaborator','collaborator@example.invalid')`;
  await sql`INSERT INTO users(id,name,email) VALUES(${privateUser},'Private smoke account','private-smoke@example.invalid')`;
  await sql`INSERT INTO admin_roles(user_id,role) VALUES(${user},'admin')`;
  await sql`INSERT INTO founders(user_id,slug,name,visibility) VALUES(${user},'smoke-owner','Synthetic owner','public'),(${collaborator},'smoke-collaborator','Synthetic collaborator','public')`;
  await sql`INSERT INTO founders(user_id,slug,name,visibility) VALUES(${privateUser},'smoke-private','Private smoke profile','private')`;
  await sql`INSERT INTO founder_sites(founder_id,site_id) SELECT id,${site} FROM founders WHERE user_id=${user}`;
  await sql`INSERT INTO notifications(user_id,event_key,type,payload) VALUES(${user},'smoke:improved','performance_improved',
    '{"siteName":"Synthetic smoke fixture","score":87,"previousScore":75,"actionPath":"/site/synthetic-smoke"}')`;
  phase = "prepare-standalone-runtime";
  await run(["runtime/prepare-standalone.mjs"]);
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  await cp("public", ".next/standalone/public", { recursive: true });
  await mkdir("test-results", { recursive: true });
  const log = createWriteStream("test-results/public-runtime.log");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DEPLOYMENT_MODE: "demo", LOG_LEVEL: "silent",
    SITE_URL: "https://demo.example.invalid", AUTH_URL: "https://demo.example.invalid", AUTH_SECRET: randomBytes(32).toString("hex"),
    AUTH_TRUST_HOST: "true", AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", REDIS_URL: process.env.REDIS_TEST_URL,
    QUEUE_PREFIX: "tfw-smoke-" + randomBytes(6).toString("hex"), PAYMENTS_ENABLED: "false", EMAIL_ENABLED: "false", ANALYTICS_ENABLED: "false",
    STORAGE_ENABLED: "false", SCREENSHOTS_ENABLED: "false", SCHEDULER_ENABLED: "false", HOSTNAME: "127.0.0.1", PORT: "3200", SMOKE_BASE_URL: "http://127.0.0.1:3200", SMOKE_SYNTHETIC_FIXTURE: "true" };
  const child = spawn(process.execPath, [".next/standalone/runtime/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
  server = child;
  child.stdout.pipe(log); child.stderr.pipe(log);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) break;
    ready = await fetch(env.SMOKE_BASE_URL + "/health/ready", { signal: AbortSignal.timeout(4000) }).then((response) => response.ok).catch(() => false);
    if (ready) break;
    await delay(1000);
  }
  if (!ready) throw new Error("Runtime fixture did not become ready");
  phase = "runtime-security-headers";
  const home = await fetch(env.SMOKE_BASE_URL!);
  if (home.headers.get("x-content-type-options") !== "nosniff" || home.headers.get("x-frame-options") !== "DENY"
    || !home.headers.get("content-security-policy")?.includes("frame-ancestors 'none'")
    || !home.headers.get("x-robots-tag")?.includes("noindex")
    || !home.headers.get("strict-transport-security")?.startsWith("max-age=")) throw new Error("Required response headers are absent");
  const robots = await fetch(env.SMOKE_BASE_URL + "/robots.txt").then((response) => response.text());
  if (!robots.includes("Disallow: /")) throw new Error("Demo indexing guard is absent");
  const privateApi = await fetch(env.SMOKE_BASE_URL + "/api/founders/collaborations");
  if (privateApi.status !== 401) throw new Error("Private API accepted an anonymous request");
  phase = "public-seo";
  await run(["scripts/verify-seo.mjs"], env);
  phase = "public-browser";
  await run(["scripts/verify-public.mjs"], env);
  phase = "authenticated-browser";
  await run(["scripts/verify-private.mjs"], { ...env, SMOKE_ADMIN_USER_ID: user, SMOKE_FOUNDER_USER_ID: collaborator, SMOKE_PRIVATE_USER_ID: privateUser, SMOKE_SITE_ID: site, SMOKE_FOUNDER_SLUG: "smoke-collaborator" });
  phase = "bounded-load";
  await run(["scripts/verify-load.mjs"], env);
  phase = "lighthouse";
  if (process.env.SMOKE_LIGHTHOUSE === "true") await run(["scripts/verify-lighthouse.mjs"], env);
} catch {
  console.error(`Runtime validation failed during ${phase}. Inspect the private test-results artifacts.`);
  process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    await Promise.race([exited, delay(28000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await cleanupIntegrationDatabase();
}
}
void main().catch(() => { console.error("Runtime fixture cleanup failed; inspect the isolated test environment."); process.exitCode = 1; });
