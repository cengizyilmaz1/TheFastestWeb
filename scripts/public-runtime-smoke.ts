import { randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { cp, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { prepareIntegrationDatabase, fixtureSql, cleanupIntegrationDatabase } from "../tests/integration/database";

let server: ChildProcess | undefined;
async function run(args: string[], env = process.env) {
  const child = spawn(process.execPath, args, { env, stdio: "inherit" });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error("Validation command failed");
}
try {
  // The fixture helper refuses any non-loopback/non-tfw_test_ target.
  await prepareIntegrationDatabase();
  const sql = fixtureSql(), user = randomUUID(), site = randomUUID();
  await sql`INSERT INTO users(id,name,email) VALUES(${user},'Synthetic smoke account','smoke@example.invalid')`;
  await sql`INSERT INTO sites(id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,current_score,last_tested_at)
    VALUES(${site},'synthetic-smoke','Synthetic smoke fixture','https://example.com','https://example.com','Isolated test data only.',${user},'Synthetic smoke account',true,87,now())`;
  await sql`INSERT INTO speed_tests(site_id,score,strategy,methodology_version) VALUES(${site},87,'mobile','legacy-unspecified')`;
  await sql`INSERT INTO site_categories(site_id,category_id,is_primary) SELECT ${site},id,true FROM categories WHERE slug='saas'`;
  await run(["runtime/prepare-standalone.mjs"]);
  await cp(".next/static", ".next/standalone/.next/static", { recursive: true });
  await cp("public", ".next/standalone/public", { recursive: true });
  await mkdir("test-results", { recursive: true });
  const log = createWriteStream("test-results/public-runtime.log");
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", DEPLOYMENT_MODE: "demo", LOG_LEVEL: "silent",
    SITE_URL: "https://demo.example.invalid", AUTH_URL: "https://demo.example.invalid", AUTH_SECRET: randomBytes(32).toString("hex"),
    AUTH_TRUST_HOST: "true", AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", REDIS_URL: process.env.REDIS_TEST_URL,
    QUEUE_PREFIX: "tfw-smoke-" + randomBytes(6).toString("hex"), PAYMENTS_ENABLED: "false", EMAIL_ENABLED: "false", ANALYTICS_ENABLED: "false",
    STORAGE_ENABLED: "false", SCREENSHOTS_ENABLED: "false", SCHEDULER_ENABLED: "false", HOSTNAME: "127.0.0.1", PORT: "3200", SMOKE_BASE_URL: "http://127.0.0.1:3200" };
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
  await run(["scripts/verify-public.mjs"], env);
} catch {
  console.error("Public runtime validation failed. Inspect the private test-results artifacts.");
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
