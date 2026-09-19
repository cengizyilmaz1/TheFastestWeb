/**
 * Migration: activity tracking columns + downgrade Keydar test user
 *
 * Run from project root:
 *   node scripts/local/migrate-activity-tracking.mjs
 *
 * What this does:
 *   1. Adds last_active_at (TIMESTAMPTZ) to users table
 *   2. Adds monitoring_paused (BOOLEAN DEFAULT false) to sites table
 *   3. Downgrades Keydar test user (sets is_pro = false)
 */

import postgres from "postgres";
import { env } from "./env.mjs";

const sql = postgres(env.DATABASE_URL);

async function run() {
  console.log("Running migration...\n");

  // 1. Add last_active_at to users
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`;
  console.log("✓ users.last_active_at added");

  // 2. Add monitoring_paused to sites
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS monitoring_paused BOOLEAN NOT NULL DEFAULT false`;
  console.log("✓ sites.monitoring_paused added");

  // 3. Downgrade Keydar test user
  const updated = await sql`
    UPDATE users
    SET is_pro = false
    WHERE email ILIKE '%keydar%' OR name ILIKE '%keydar%'
    RETURNING id, email, name, is_pro
  `;

  if (updated.length === 0) {
    console.log("! No Keydar user found — check email/name spelling");
  } else {
    for (const u of updated) {
      console.log(`✓ Downgraded: ${u.name} (${u.email}) → isPro = ${u.is_pro}`);
    }
  }

  // Also downgrade their sites back to free tier
  if (updated.length > 0) {
    const userId = updated[0].id;
    const sitesUpdated = await sql`
      UPDATE sites
      SET tier = 'free'
      WHERE owner_id = ${userId}
      RETURNING name, url, tier
    `;
    for (const s of sitesUpdated) {
      console.log(`  ↳ Site downgraded: ${s.name} → tier = ${s.tier}`);
    }
  }

  console.log("\nMigration complete.");
  await sql.end();
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
