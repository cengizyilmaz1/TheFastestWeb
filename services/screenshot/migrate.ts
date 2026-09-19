import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

async function main() {
  if (process.argv[2] !== "--apply") throw new Error("Pass --apply with a dedicated screenshot migration database URL");
  const raw = process.env.SCREENSHOT_MIGRATION_DATABASE_URL;
  if (!raw || !new URL(raw).pathname.toLowerCase().includes("screenshot")) throw new Error("A dedicated screenshot database URL is required");
  const sql = postgres(raw, { max: 1, connect_timeout: 5, onnotice: () => undefined });
  try { await sql.unsafe(await readFile(resolve(process.cwd(), "services/screenshot/migrations/0001_capture_ledger.sql"), "utf8")); }
  finally { await sql.end(); }
}
void main().catch(() => { process.stderr.write("Screenshot migration failed; check the dedicated database configuration.\n"); process.exitCode = 1; });
