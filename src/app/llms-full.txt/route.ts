import { fullReference } from "@/modules/seo/markdown";
import { markdownResponse, markdownUnavailable, rejectMarkdownQuery } from "@/modules/seo/markdown-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET(request?: Request) {
  const invalid = rejectMarkdownQuery(request);
  if (invalid) return invalid;
  try { return markdownResponse(fullReference()); }
  catch { return markdownUnavailable(); }
}
