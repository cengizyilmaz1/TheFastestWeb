import { referencePart, referenceSections, type ReferenceSection } from "@/modules/seo/reference-corpus";
import { markdownResponse, markdownUnavailable, rejectMarkdownQuery } from "@/modules/seo/markdown-response";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ section: string; page: string }> }) {
  const invalid = rejectMarkdownQuery(request);
  if (invalid) return invalid;
  const notFound = () => markdownResponse({ canonicalPath: "/llms/catalog.md", body: "# Not found\n\nThis part is not present in the public corpus index." }, 404);
  try {
    const { section, page } = await context.params;
    if (!referenceSections.includes(section as ReferenceSection) || !/^(0|[1-9]\d{0,8})\.md$/.test(page)) return notFound();
    const document = await referencePart(section as ReferenceSection, Number(page.slice(0, -3)));
    return document ? markdownResponse(document) : notFound();
  } catch { return markdownUnavailable(); }
}
