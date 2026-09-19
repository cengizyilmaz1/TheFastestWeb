import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

// Lazy-init: only create the client when DATABASE_URL is set
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!connectionString) return null;
  if (!_db) {
    const client = postgres(connectionString);
    _db = drizzle(client, { schema });
  }
  return _db;
}

// Keep backward-compat export (will throw if DATABASE_URL is missing)
export const db = connectionString
  ? drizzle(postgres(connectionString), { schema })
  : (null as unknown as ReturnType<typeof drizzle<typeof schema>>);
