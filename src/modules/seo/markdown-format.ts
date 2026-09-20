import { siteConfig } from "@/config/site";
import { recordedDate, siteUrl } from "@/lib/seo/metadata";
import type { Post } from "@/lib/blog";
import type { MarkdownDocument } from "./markdown-response";

export type PublicPageContent = {
  title: string;
  description: string;
  path: string;
  updated?: string;
  sections: readonly {
    id: string;
    title: string;
    paragraphs: readonly string[];
    bullets?: readonly string[];
    items?: readonly { title: string; paragraphs: readonly string[] }[];
    after?: readonly string[];
  }[];
};

/** Single-line labels cannot create Markdown links, headings or embedded HTML. */
export function markdownText(value: string) {
  return value.replace(/\s+/g, " ").replace(/\p{Cc}/gu, "").replace(/[\\`*_[\]<>|]/g, "\\$&").trim();
}

export function documentHeader(title: string, path: string, details: { author?: string; published?: string; updated?: string } = {}) {
  const published = recordedDate(details.published);
  const updated = recordedDate(details.updated);
  return [`# ${markdownText(title)}`, `Canonical source: ${siteUrl(path)}`, `Publisher: ${markdownText(siteConfig.name)}`,
    ...(details.author ? [`Author: ${markdownText(details.author)}`] : []),
    ...(published ? [`Published: ${published}`] : []),
    ...(updated && (!published || updated >= published) ? [`Updated: ${updated}`] : [])].join("\n\n");
}

export function publicPageMarkdown(page: PublicPageContent): MarkdownDocument {
  return {
    canonicalPath: page.path,
    body: [documentHeader(page.title, page.path, { updated: page.updated }), page.description,
      ...page.sections.map((section) => [`## ${markdownText(section.title)}`, ...section.paragraphs,
        ...(section.bullets?.length ? [section.bullets.map((item) => `- ${item}`).join("\n")] : []),
        ...(section.items?.map((item) => [`### ${markdownText(item.title)}`, ...item.paragraphs].join("\n\n")) ?? []),
        ...(section.after ?? [])].join("\n\n"))].join("\n\n"),
  };
}

export function articleMarkdown(post: Post): MarkdownDocument {
  // The repository contains public Markdown with fenced examples. Return it as
  // source: never evaluate MDX, import modules, or scrape an arbitrary URL.
  return {
    canonicalPath: `/blog/${post.slug}`,
    body: [documentHeader(post.title, `/blog/${post.slug}`, { author: post.author, published: post.date, updated: post.updated }),
      post.description, post.content.trim()].join("\n\n"),
  };
}

export const measurementGuidance = "Scores are recorded Google PageSpeed Insights and Lighthouse lab measurements, not real-user Core Web Vitals certification. Compare the measured URL, device and test date. Historical scores do not establish current speed. Missing measurements are not zero. Total blocking time is not field interaction to next paint. Paid plans and sponsorship do not increase measured scores or organic leaderboard rank.";
