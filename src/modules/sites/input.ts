import { z } from "zod";
import { normalizePublicUrl } from "@/lib/security/public-url";
import { AppError } from "@/lib/http/errors";

export const submissionSchema = z.object({
  url: z.string().trim().min(1).max(4096),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(500),
  twitterHandle: z.string().trim().max(30).regex(/^@?[a-zA-Z0-9_]*$/).optional(),
  category: z.enum(["saas", "tool", "directory", "agency", "ecommerce", "blog", "portfolio", "other"]),
  faviconUrl: z.string().max(4096).optional(),
  isListed: z.boolean().default(true),
  testResultId: z.uuid(),
}).strict();
export type SubmissionInput = z.infer<typeof submissionSchema>;

export function normalizeSubmittedUrl(input: string): string {
  try { return normalizePublicUrl(input); }
  catch { throw new AppError("URL_BLOCKED", "Please enter a public HTTP or HTTPS website address.", 400); }
}
