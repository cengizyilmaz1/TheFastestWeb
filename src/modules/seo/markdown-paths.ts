import { findCategory } from "@/modules/catalog/categories";

/** Intentionally public pages only: never derive an export path from a URL or a filename. */
export const markdownPagePaths = ["/about", "/blog", "/categories", "/pricing", "/advertise", "/privacy", "/terms"] as const;
const articlePath = /^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function publicMarkdownPath(path: string): string | undefined {
  if (path.includes("?") || path.includes("#") || path.includes("\\")) return undefined;
  if (markdownPagePaths.some((allowed) => allowed === path) || articlePath.test(path)) return `/markdown${path}`;
  const category = /^\/fastest\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path)?.[1];
  return category && findCategory(category) ? `/markdown${path}` : undefined;
}
