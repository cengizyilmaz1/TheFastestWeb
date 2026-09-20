import type { ReactNode } from "react";

/** Markdown route handlers serve documents, so these links use native navigation. */
export function MarkdownLink({ path, children = "Read as Markdown", className = "content-link text-sm" }: { path: string; children?: ReactNode; className?: string }) {
  return <a href={`/markdown${path}`} className={className}>{children}</a>;
}
