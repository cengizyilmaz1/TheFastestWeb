import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sites } from "./schema";
import { seedSites } from "./seed";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client);

  console.log(`Seeding ${seedSites.length} sites...`);

  for (const s of seedSites) {
    try {
      await db.insert(sites).values({
        slug: s.slug!,
        name: s.name,
        url: s.url,
        description: s.description,
        faviconUrl: s.faviconUrl ?? null,
        ownerName: s.ownerName,
        twitterHandle: null,
        tier: s.tier ?? "pro",
        isListed: s.isListed ?? true,
        currentScore: s.currentScore ?? 0,
        currentLoadTime: s.currentLoadTime ?? null,
        currentFcp: s.currentFcp ?? null,
        currentLcp: s.currentLcp ?? null,
        currentCls: s.currentCls ?? null,
        currentTbt: s.currentTbt ?? null,
        currentTti: s.currentTti ?? null,
        currentSi: s.currentSi ?? null,
        trend: s.trend ?? 0,
        countryFlag: s.countryFlag ?? null,
      }).onConflictDoNothing();
      console.log(`  + ${s.name}`);
    } catch (err) {
      console.error(`  x ${s.name}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log("Done!");
  await client.end();
}

main();
