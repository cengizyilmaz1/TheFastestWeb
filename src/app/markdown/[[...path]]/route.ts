import { getMarkdownDocument } from "@/modules/seo/markdown";
import { markdownResponse, markdownUnavailable, rejectMarkdownQuery } from "@/modules/seo/markdown-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const invalid = rejectMarkdownQuery(request);
  if (invalid) return invalid;
  try {
    const { path } = await context.params;
    const document = await getMarkdownDocument(path);
    return document ? markdownResponse(document)
      : markdownResponse({ canonicalPath: "/markdown", body: "# Not found\n\nThis page is not part of the public Markdown library." }, 404);
  } catch {
    return markdownUnavailable();
  }
}
