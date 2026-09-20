import { siteConfig } from "@/config/site";
import { aboutPage } from "@/content/about";
import { publicPages } from "@/content/public-pages";
import { getAllPosts, getPost } from "@/lib/blog";
import { AppError } from "@/lib/http/errors";
import { recordedDate, siteUrl } from "@/lib/seo/metadata";
import { categoryCatalog, categoryPath, findCategory } from "@/modules/catalog/categories";
import { getCategoryListing } from "@/modules/catalog/public-categories";
import { articleMarkdown, documentHeader, markdownText, measurementGuidance, publicPageMarkdown } from "./markdown-format";
import { markdownPagePaths, publicMarkdownPath } from "./markdown-paths";
import type { MarkdownDocument } from "./markdown-response";

const articleLimit = 128;
const referenceByteLimit = 1024 * 1024;
const articleByteLimit = 256 * 1024;

const pages = () => [aboutPage, ...Object.values(publicPages)].filter((page) => markdownPagePaths.some((path) => path === page.path));
const publicPosts = () => getAllPosts().filter((post) => publicMarkdownPath(`/blog/${post.slug}`));
const link = (label: string, path: string) => `[${markdownText(label)}](${siteUrl(path)})`;
const markdownLink = (label: string, path: string) => link(label, publicMarkdownPath(path)!);

function categoriesMarkdown(): MarkdownDocument {
  return {
    canonicalPath: "/categories",
    body: [documentHeader("Website categories", "/categories"),
      "Browse the IndieTools interest categories and the original website types. Each collection links to public websites and their recorded mobile lab performance.",
      measurementGuidance,
      ...["IndieTools categories", "Website types"].map((group) => [
        `## ${group}`,
        ...categoryCatalog.filter((category) => category.group === group).map((category) => [
          `### ${markdownLink(category.name, categoryPath(category.slug))}`,
          category.description, category.focus,
          `Public leaderboard: ${siteUrl(categoryPath(category.slug))}`,
        ].join("\n\n")),
      ].join("\n\n")),
    ].join("\n\n"),
  };
}

async function categoryMarkdown(slug: string): Promise<MarkdownDocument | null> {
  const category = findCategory(slug);
  if (!category) return null;
  const listing = await getCategoryListing(category.slug, 1);
  if (!listing.available) throw new AppError("DATABASE_UNAVAILABLE", "Public category results are temporarily unavailable.", 503);
  return {
    canonicalPath: categoryPath(category.slug), live: true,
    body: [documentHeader(`Fastest ${category.name} websites`, categoryPath(category.slug)),
      category.description, category.focus, measurementGuidance,
      "## Recorded website results",
      `Public websites in this collection: ${listing.total}. This representation includes the first page of the public leaderboard.`,
      ...(listing.sites.length ? listing.sites.map((site, index) => {
        const tested = recordedDate(site.lastTestedAt);
        const score = tested && typeof site.currentScore === "number" && Number.isFinite(site.currentScore) && site.currentScore >= 0 && site.currentScore <= 100
          ? `${site.currentScore}/100` : "No dated measurement available";
        return `${index + 1}. ${link(site.name, `/site/${encodeURIComponent(site.slug)}`)} — recorded mobile lab score: ${score}${tested ? `; last tested: ${tested}` : ""}.`;
      }) : ["There are no published website results in this collection yet."]),
      ...(listing.pages > 1 ? [`Continue reading the ${link("public leaderboard", categoryPath(category.slug))} for all ${listing.pages} pages.`] : []),
      `Learn ${markdownLink("how measurements work", "/about")} or ${link("submit a website", "/submit")}.`,
    ].join("\n\n"),
  };
}

function blogMarkdown(): MarkdownDocument {
  const posts = publicPosts();
  return {
    canonicalPath: "/blog",
    body: [documentHeader("Website performance journal", "/blog"),
      "Published guides about page loading, lab measurements and website performance. Each article retains its original byline and publication date; a redesign does not make an older guide newly updated.",
      ...posts.slice(0, articleLimit).map((post) => [
        `## ${markdownLink(post.title, `/blog/${post.slug}`)}`,
        markdownText(post.description), `Author: ${markdownText(post.author)}`,
        ...(recordedDate(post.date) ? [`Published: ${recordedDate(post.date)}`] : []),
        ...(post.updated && recordedDate(post.updated) && (!recordedDate(post.date) || recordedDate(post.updated)! >= recordedDate(post.date)!)
          ? [`Updated: ${recordedDate(post.updated)}`] : []),
        `Canonical article: ${siteUrl(`/blog/${post.slug}`)}`,
      ].join("\n\n")),
      ...(posts.length > articleLimit ? [`This index includes ${articleLimit} articles. Visit ${siteUrl("/blog")} for the complete archive.`] : []),
    ].join("\n\n"),
  };
}

function markdownIndex(): MarkdownDocument {
  return {
    canonicalPath: "/markdown",
    body: [documentHeader(`${siteConfig.name} — Markdown library`, "/markdown"),
      "Readable Markdown versions of published pages and articles. The HTML page named in each document is its canonical source. These are public content exports, not account, payment or operational data exports.",
      "## Public pages", ...pages().map((page) => `- ${markdownLink(page.title, page.path)}: ${markdownText(page.description)}`),
      `- ${markdownLink("Categories", "/categories")}: All public category descriptions and comparison guidance.`,
      `- ${markdownLink("Blog", "/blog")}: Article index with authors and publication dates.`,
      "## Website categories", ...categoryCatalog.map((category) => `- ${markdownLink(category.name, categoryPath(category.slug))}: ${category.description}`),
      "## Articles", ...publicPosts().slice(0, articleLimit).map((post) => `- ${markdownLink(post.title, `/blog/${post.slug}`)}: ${markdownText(post.description)}`),
      "## Reference files",
      `- ${link("llms.txt", "/llms.txt")}: Concise public content guide.`,
      `- ${link("llms-full.txt", "/llms-full.txt")}: Combined public page content and complete published articles, within the documented size limit.`,
    ].join("\n\n"),
  };
}

/** Closed route allowlist: no arbitrary file reads, URL fetches or user/owner queries. */
export async function getMarkdownDocument(segments: readonly string[] = []): Promise<MarkdownDocument | null> {
  if (segments.length > 2 || segments.some((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(segment))) return null;
  if (segments.length === 0) return markdownIndex();
  const path = `/${segments.join("/")}`;
  if (!publicMarkdownPath(path)) return null;
  const page = pages().find((entry) => entry.path === path);
  if (page) return publicPageMarkdown(page);
  if (path === "/categories") return categoriesMarkdown();
  if (path === "/blog") return blogMarkdown();
  if (segments[0] === "fastest") return categoryMarkdown(segments[1]);
  if (segments[0] === "blog") {
    const post = getPost(segments[1]);
    if (!post) return null;
    const document = articleMarkdown(post);
    if (Buffer.byteLength(document.body, "utf8") > articleByteLimit) throw new AppError("SERVICE_UNAVAILABLE", "The Markdown article exceeds its publication size limit.", 503);
    return document;
  }
  return null;
}

export function shortReference(): MarkdownDocument {
  return {
    canonicalPath: "/llms.txt",
    body: [`# ${markdownText(siteConfig.name)}`,
      "> A public website performance leaderboard, recorded lab reports, and practical articles about improving page loading.",
      measurementGuidance,
      `Owned and maintained by ${markdownText(siteConfig.ownerName)} (${siteConfig.ownerUrl}). Contact: ${markdownText(siteConfig.email)}. Article bylines retain their original attribution; the current operator is not automatically the author of an older article.`,
      "Cite the canonical source and its recorded date. Do not infer private account information, current performance, endorsements or a real-user certification. Public Markdown does not include account data, checkout sessions or operational secrets. These files help readers navigate content; they do not guarantee search indexing or inclusion in AI answers.",
      "## Public pages", ...pages().map((page) => `- ${markdownLink(page.title, page.path)}: ${markdownText(page.description)}`),
      `- ${markdownLink("Website categories", "/categories")}: Browse website types and IndieTools interest categories.`,
      `- ${markdownLink("Performance journal", "/blog")}: Published guides with dates, bylines and links to the complete articles.`,
      "## References",
      `- ${link("Markdown library", "/markdown")}: Index of every supported public Markdown destination.`,
      `- ${link("Complete public reference", "/llms-full.txt")}: Page content and full articles in one bounded document.`,
      "## Optional",
      `- ${link("Leaderboard", "/")}: Browse public websites and follow their recorded performance reports.`,
      `- ${link("Test a website", "/test")}: Run a public speed test when testing is available.`,
      `- ${link("Submit a website", "/submit")}: Sign in to submit a website; private submission and account records are not exported.`,
    ].join("\n\n"),
  };
}

export function fullReference(): MarkdownDocument {
  const posts = publicPosts();
  const chunks = [documentHeader(`${siteConfig.name} — complete public reference`, "/llms-full.txt"),
    "This reference combines the published service pages, category descriptions, article index and complete repository articles. Website result lists are available from individual public category documents and their canonical reports. Private accounts, billing records, claim tokens and operational configuration are never included.",
    measurementGuidance,
    "Articles retain their recorded byline and dates. Statements in an older article describe that editorial source and may need verification against current provider documentation. No modification date is inferred from deployment time.",
    ...pages().map((page) => publicPageMarkdown(page).body), categoriesMarkdown().body, blogMarkdown().body,
  ];
  const omitted: string[] = [];
  let bytes = Buffer.byteLength(chunks.join("\n\n---\n\n"), "utf8");
  // Leave room for an explicit omission notice; never silently cut an article.
  for (const [index, post] of posts.entries()) {
    const article = index < articleLimit ? getPost(post.slug) : null;
    const body = article ? articleMarkdown(article).body : "";
    const length = Buffer.byteLength(body, "utf8");
    if (!article || length > articleByteLimit || bytes + length > referenceByteLimit - 4096) {
      omitted.push(post.slug);
      continue;
    }
    chunks.push(body);
    bytes += length + 7;
  }
  if (omitted.length) chunks.push(`## Additional articles\n\n${omitted.length} articles are outside this combined document's limit of ${articleLimit} articles and 1 MiB. Complete individual articles are linked from the ${link("Markdown article index", "/markdown/blog")}. No article was partially reproduced.`);
  const body = chunks.join("\n\n---\n\n");
  if (Buffer.byteLength(body, "utf8") > referenceByteLimit) throw new AppError("SERVICE_UNAVAILABLE", "The combined reference exceeds its publication size limit.", 503);
  return { canonicalPath: "/llms-full.txt", body };
}
