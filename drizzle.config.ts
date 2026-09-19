import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/db/schema.ts",
  // Generated proposals are reviewed into the guarded SQL runner; never push/migrate directly.
  out: "./.analysis-temp/drizzle-proposals",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || "",
  },
});
