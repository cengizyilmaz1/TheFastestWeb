import { z } from "zod";
const reserved = /^\/(?:api|admin|auth|login|sign-in|logout|profile|founder|founders|dashboard|unsubscribe|health|_next|\.well-known)(?:\/|$)/i;
/** Exact local public paths only; no schemes, escaped separators, capabilities or queries. */
export function isManagedRedirectPath(path: string): boolean {
  return path.length <= 500 && /^\/(?:[a-zA-Z0-9][a-zA-Z0-9/_-]*)?$/.test(path)
    && !path.includes("//") && (path === "/" || !path.endsWith("/")) && !reserved.test(path);
}
export const redirectInputSchema = z.object({ id: z.uuid(), sourcePath: z.string().refine(isManagedRedirectPath),
  destinationPath: z.string().refine(isManagedRedirectPath), statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]),
  enabled: z.boolean(), expectedVersion: z.number().int().min(0), reason: z.string().trim().min(8).max(500) }).strict()
  .refine(value => value.sourcePath !== "/" && value.sourcePath !== value.destinationPath, "The source must differ from the destination and cannot be the homepage.");
export type RedirectInput = z.infer<typeof redirectInputSchema>;
export function redirectsConflict(input: Pick<RedirectInput, "id" | "sourcePath" | "destinationPath" | "enabled">,
  rules: { id: string; sourcePath: string; destinationPath: string; enabled: boolean }[]): boolean {
  return rules.some(rule => rule.id !== input.id && (rule.sourcePath === input.sourcePath
    || input.enabled && rule.enabled && (rule.sourcePath === input.destinationPath || rule.destinationPath === input.sourcePath)));
}

