import { referenceCatalog } from "@/modules/seo/reference-corpus";
import { markdownResponse, markdownUnavailable, rejectMarkdownQuery } from "@/modules/seo/markdown-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const invalid = rejectMarkdownQuery(request);
  if (invalid) return invalid;
  try { return markdownResponse(await referenceCatalog()); }
  catch { return markdownUnavailable(); }
}
