import type { Metadata } from "next";
import { siteConfig } from "@/config/site";
import { publicMarkdownPath } from "@/modules/seo/markdown-paths";

export const SITE_DESCRIPTION = "Compare recorded website speed scores, explore performance reports, and learn how to improve PageSpeed and Core Web Vitals.";

/** Canonicals are deployment-local and callers supply only known internal paths. */
export function siteUrl(path = "/") {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) throw new TypeError("Expected an internal canonical path");
  return new URL(path, siteConfig.url).href;
}

export function pageMetadata({ title, description, path, index = true, follow = true, type = "website", publishedTime, modifiedTime, image = "/og.png" }: {
  title: string; description: string; path: string; index?: boolean; follow?: boolean;
  type?: "website" | "article"; publishedTime?: string; modifiedTime?: string; image?: string;
}): Metadata {
  const fullTitle = `${title} | ${siteConfig.name}`;
  const indexable = index && !siteConfig.isDemo;
  const imageUrl = siteUrl(image);
  const markdownPath = publicMarkdownPath(path);
  return {
    title: { absolute: fullTitle }, description,
    alternates: { canonical: siteUrl(path), ...(markdownPath ? { types: { "text/markdown": siteUrl(markdownPath) } } : {}) },
    robots: { index: indexable, follow: follow && !siteConfig.isDemo,
      ...(indexable ? { googleBot: { index: true, follow, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } } : {}) },
    openGraph: { title: fullTitle, description, url: siteUrl(path), siteName: siteConfig.name, locale: "en_US", type,
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {}),
      images: [{ url: imageUrl, ...(image === "/og.png" ? { width: 1536, height: 1024 } : {}), alt: title }] },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [imageUrl] },
  };
}

/** A timestamp is evidence from the content or measurement, never the render clock. */
export function recordedDate(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

/** Keep HTML, social metadata, structured data and exports on the same chronology. */
export function publicationDates(published?: string | Date | null, modified?: string | Date | null) {
  const datePublished = recordedDate(published);
  const candidate = recordedDate(modified);
  const dateModified = candidate && (!datePublished || candidate >= datePublished) ? candidate : undefined;
  return { datePublished, dateModified };
}
