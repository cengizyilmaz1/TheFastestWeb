import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { redirectRules } from "@/db/schema";
import { isManagedRedirectPath } from "./policy";
export async function resolveManagedRedirect(pathname: string) {
  if (!isManagedRedirectPath(pathname)) return null;
  const db = getDb(); if (!db) return null;
  const [rule] = await db.select().from(redirectRules).where(and(eq(redirectRules.sourcePath, pathname), eq(redirectRules.enabled, true))).limit(1);
  if (!rule || !isManagedRedirectPath(rule.destinationPath) || rule.sourcePath === rule.destinationPath || ![301, 302, 307, 308].includes(rule.statusCode)) return null;
  const [chain] = await db.select({ id: redirectRules.id }).from(redirectRules)
    .where(and(eq(redirectRules.sourcePath, rule.destinationPath), eq(redirectRules.enabled, true))).limit(1);
  return chain ? null : { id: rule.id, path: rule.destinationPath, status: rule.statusCode };
}
