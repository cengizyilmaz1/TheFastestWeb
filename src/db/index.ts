import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;
type PoolState = { client: ReturnType<typeof postgres>; database: Database; url: string };
const processState = globalThis as typeof globalThis & { __theFastestWebPool?: PoolState };

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

/** Lazy and build-safe. Both exports use this single bounded process pool. */
export function getDb(): Database | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (processState.__theFastestWebPool) {
    if (processState.__theFastestWebPool.url !== url) {
      throw new Error("DATABASE_URL changed while the database pool is open");
    }
    return processState.__theFastestWebPool.database;
  }
  const client = postgres(url, {
    max: positiveInteger("DB_MAX_CONNECTIONS", 10),
    connect_timeout: positiveInteger("DB_CONNECT_TIMEOUT_SECONDS", 10),
    idle_timeout: positiveInteger("DB_IDLE_TIMEOUT_SECONDS", 20),
    connection: {
      application_name: "thefastestweb",
      statement_timeout: positiveInteger("DB_STATEMENT_TIMEOUT_MS", 10_000),
    },
  });
  const database = drizzle(client, { schema });
  processState.__theFastestWebPool = { client, database, url };
  return database;
}

/** Compatibility for existing db imports without creating a second connection pool. */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const database = getDb();
    if (!database) throw new Error("DATABASE_URL is required for database operations");
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export async function closeDb(): Promise<void> {
  const state = processState.__theFastestWebPool;
  if (!state) return;
  delete processState.__theFastestWebPool;
  await state.client.end({ timeout: 5 });
}
