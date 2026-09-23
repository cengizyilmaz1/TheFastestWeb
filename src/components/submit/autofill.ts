import { findCategory } from "@/modules/catalog/categories";
import type { SiteMetadata } from "@/modules/sites/metadata";

export type AutofillField = "name" | "description" | "category" | "faviconUrl";
export function listingSuggestions(metadata: Partial<SiteMetadata> | null, url: string): Partial<Record<AutofillField, string>> {
  const clean = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
  let domain = "";
  try { domain = new URL(url).hostname.replace(/^www\./, "").slice(0, 60); } catch { /* Leave an invalid URL for explicit validation. */ }
  const title = clean(metadata?.title, 60) || domain;
  const description = clean(metadata?.description, 500);
  const category = findCategory(metadata?.suggestedCategory ?? "")?.slug;
  const faviconUrl = metadata?.faviconUrl;
  return { ...(title ? { name: title } : {}), ...(description ? { description } : {}), ...(category ? { category } : {}),
    ...(typeof faviconUrl === "string" && /^https?:\/\//.test(faviconUrl) ? { faviconUrl } : {}) };
}

/** Protect user edits and discard responses from an earlier URL or request. */
export function createAutofillSession(initialEdited: AutofillField[] = []) {
  let request = 0;
  const edited = new Set(initialEdited);
  return {
    start: () => ++request,
    current: (id: number) => id === request,
    canFill: (id: number, field: AutofillField) => id === request && !edited.has(field),
    edit: (field: AutofillField) => { edited.add(field); },
    reset: () => { request++; edited.clear(); for (const field of initialEdited) edited.add(field); },
    cancel: () => { request++; },
  };
}
