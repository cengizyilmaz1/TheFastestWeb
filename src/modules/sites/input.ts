import { z } from "zod";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { AppError } from "@/lib/http/errors";
import { countryCodeSchema, listingFields } from "./listing-fields";

export const submissionSchema = z.object({
  ...listingFields,
  isListed: z.boolean().default(true),
  testResultId: z.uuid(),
  desktopTestResultId: z.uuid().optional(),
  preparationId: z.uuid().optional(),
  tagline: z.string().trim().max(140).optional(),
  countryCode: countryCodeSchema.nullable().optional(),
  categoryIds: z.array(z.uuid()).min(1).max(8).refine((ids) => new Set(ids).size === ids.length).optional(),
  technologyIds: z.array(z.uuid()).max(20).refine((ids) => new Set(ids).size === ids.length).optional(),
  founderIds: z.array(z.uuid()).max(5).refine((ids) => new Set(ids).size === ids.length).optional(),
  socialLinks: z.array(z.object({ platform: z.string().regex(/^[a-z0-9-]{1,32}$/), url: z.string().max(2048).transform((value, ctx) => {
    try { return normalizePublicUrl(value); } catch { ctx.addIssue({ code: "custom", message: "Enter a public HTTP or HTTPS social URL." }); return z.NEVER; }
  }) }).strict()).max(10).refine((links) => new Set(links.map((link) => link.platform)).size === links.length).optional(),
}).strict();
export type SubmissionInput = z.infer<typeof submissionSchema>;
/** New HTTP publications must complete the current two-device preparation.
 * The base contract remains useful for validating historic migration fixtures. */
export const publicationSchema = submissionSchema.extend({ preparationId: z.uuid(), desktopTestResultId: z.uuid(), countryCode: countryCodeSchema });

export function normalizeSubmittedUrl(input: string): string {
  try { return normalizePublicUrl(input); }
  catch { throw new AppError("URL_BLOCKED", "Please enter a public HTTP or HTTPS website address.", 400); }
}
