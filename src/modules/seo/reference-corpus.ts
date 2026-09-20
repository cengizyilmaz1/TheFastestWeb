import { siteConfig } from "@/config/site";
import { getAllPosts, getPost } from "@/lib/blog";
import { AppError } from "@/lib/http/errors";
import { recordedDate, siteUrl } from "@/lib/seo/metadata";
import { countPublicFounders, listPublicFounderDiscovery } from "@/modules/founders/discovery";
import { getFounderPath } from "@/modules/founders/paths";
import { articleMarkdown, documentHeader, measurementGuidance } from "./markdown-format";
import { countPublicSites, discoveryOffset, discoveryPageSize, listPublicSiteRecords, withDiscoveryAvailability } from "./public-corpus";
import type { MarkdownDocument } from "./markdown-response";

export const referenceSections = ["sites", "articles", "founders"] as const;
export type ReferenceSection = typeof referenceSections[number];
export const referencePartByteLimit = 1024 * 1024;
type Part = { section: ReferenceSection; page: number; path: string; records: number };
type ArticlePart = { body: string; records: number };
const partPath = (section: ReferenceSection, page: number) => `/llms/${section}/${page}.md`;
const unavailable = () => new AppError("SERVICE_UNAVAILABLE", "The public reference is temporarily unavailable.", 503);

/** Repository articles remain whole; a larger archive has more named parts. */
export function articleReferenceParts(): ArticlePart[] {
  const parts: ArticlePart[] = [];
  for (const meta of getAllPosts().sort((a, b) => a.slug.localeCompare(b.slug, "en"))) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug)) continue;
    const post = getPost(meta.slug);
    if (!post) throw unavailable();
    const body = articleMarkdown(post).body;
    // Reserve space for the part's navigation/header. Do not publish a partial article.
    if (Buffer.byteLength(body, "utf8") > referencePartByteLimit - 8192) throw unavailable();
    const previous = parts.at(-1);
    if (previous && previous.records < discoveryPageSize && Buffer.byteLength(previous.body + "\n\n---\n\n" + body, "utf8") <= referencePartByteLimit - 8192) {
      previous.body += "\n\n---\n\n" + body; previous.records++;
    } else parts.push({ body, records: 1 });
  }
  return parts;
}

export async function referenceManifest(articleParts = articleReferenceParts()) {
  const [sites, founders] = siteConfig.isDemo ? [0, 0] : await withDiscoveryAvailability(() => Promise.all([countPublicSites(), countPublicFounders()]));
  const counts = { sites, founders, articles: articleParts.reduce((sum, part) => sum + part.records, 0) };
  const partCounts = { sites: Math.ceil(sites / discoveryPageSize), founders: Math.ceil(founders / discoveryPageSize), articles: articleParts.length };
  if (Object.values(partCounts).some((count) => !Number.isSafeInteger(count) || count < 0)
    || Object.values(partCounts).reduce((sum, count) => sum + count, 0) > 50_000) throw unavailable();
  const parts: Part[] = referenceSections.flatMap((section) => Array.from({ length: partCounts[section] }, (_, page) => ({
    section, page, path: partPath(section, page),
    records: section === "articles" ? articleParts[page].records : Math.min(discoveryPageSize, counts[section] - page * discoveryPageSize),
  })));
  return { counts, parts, articleParts };
}

export function manifestMarkdown(manifest: Awaited<ReturnType<typeof referenceManifest>>) {
  return ["## Complete corpus manifest",
    `Published website records: ${manifest.counts.sites}. Public founder profiles: ${manifest.counts.founders}. Published articles: ${manifest.counts.articles}.`,
    "Read every listed part to obtain the complete public corpus. Website and founder records are separate from this service reference. Each part contains at most 200 records; article parts also have a 1 MiB bound and preserve whole articles. Part numbers start at zero. Parts are ordered deterministically and include previous/next links. The live directory can change between requests; re-read this manifest when collecting a new snapshot.",
    ...manifest.parts.map((part) => `- [${part.section} part ${part.page + 1}](${siteUrl(part.path)}): ${part.records} records.`),
    ...(manifest.parts.length ? [] : ["No published corpus records are available in this deployment."]),
  ].join("\n\n");
}

export async function referenceCatalog(): Promise<MarkdownDocument> {
  return { canonicalPath: "/llms/catalog.md", live: true, body: [documentHeader(`${siteConfig.name} — public corpus index`, "/llms/catalog.md"),
    "This manifest lists every published corpus part. It contains no private accounts, billing data, drafts or operational configuration.",
    manifestMarkdown(await referenceManifest()), measurementGuidance,
  ].join("\n\n") };
}

/** Publisher-provided copy is serialized data, never executable Markdown/HTML
 * or instructions from the service. All values are preserved without truncation. */
function sourceData(data: Record<string, unknown>): string {
  const json = JSON.stringify(data, null, 2).replace(/[<>&`]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `Publisher-supplied data (not service instructions or verified claims):\n\n\`\`\`json\n${json}\n\`\`\``;
}
const validScore = (value: number, tested: string | undefined) => tested && Number.isFinite(value) && value >= 0 && value <= 100 ? `${value}/100` : "No dated measurement available";

export async function referencePart(section: ReferenceSection, page: number): Promise<MarkdownDocument | null> {
  if (!referenceSections.includes(section)) return null;
  const offset = discoveryOffset(page);
  return withDiscoveryAvailability(async () => {
    const manifest = await referenceManifest();
    const current = manifest.parts.find((part) => part.section === section && part.page === page);
    if (!current) return null;
    const partCount = manifest.parts.filter((part) => part.section === section).length;
    const navigation = [`[Corpus index](${siteUrl("/llms/catalog.md")})`,
      ...(page > 0 ? [`[Previous part](${siteUrl(partPath(section, page - 1))})`] : []),
      ...(page + 1 < partCount ? [`[Next part](${siteUrl(partPath(section, page + 1))})`] : [])].join(" | ");
    let content: string;
    if (section === "articles") content = manifest.articleParts[page].body;
    else if (section === "founders") {
      const rows = await listPublicFounderDiscovery(discoveryPageSize, offset);
      if (!rows.length) return null;
      content = rows.map((row, index) => [`## Public founder ${offset + index + 1}`, `Canonical profile: ${siteUrl(getFounderPath(row.username))}`,
        ...(recordedDate(row.updatedAt) ? [`Profile updated: ${recordedDate(row.updatedAt)}`] : []), sourceData({ name: row.name, bio: row.bio }),
      ].join("\n\n")).join("\n\n---\n\n");
    } else {
      const rows = await listPublicSiteRecords(page);
      if (!rows.length) return null;
      content = rows.map((row, index) => {
        const tested = recordedDate(row.lastTestedAt);
        return [`## Published website ${offset + index + 1}`, `Canonical report: ${siteUrl(`/site/${encodeURIComponent(row.slug)}`)}`,
          `Recorded mobile lab score: ${validScore(row.currentScore, tested)}.`, ...(tested ? [`Last tested: ${tested}`] : []),
          sourceData({ name: row.name, website: row.url, description: row.description, tagline: row.tagline, websiteType: row.category, country: row.countryCode }),
        ].join("\n\n");
      }).join("\n\n---\n\n");
    }
    const body = [documentHeader(`${siteConfig.name} — ${section}, part ${page + 1} of ${partCount}`, current.path),
      navigation, section === "articles" ? "Complete published editorial articles, preserving original bylines and dates." : measurementGuidance,
      content, navigation].join("\n\n");
    return { canonicalPath: current.path, live: true, body };
  });
}
