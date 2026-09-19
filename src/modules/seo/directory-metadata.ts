import type { Metadata } from "next";
import { getCatalog } from "@/modules/catalog/service";
import { getDiscovery } from "@/modules/sites/directory";

type Search = Record<string, string | string[] | undefined>;
export function hasDirectoryFilters(search: Search) {
  return Object.entries(search).some(([key, value]) => value !== undefined && value !== "" && !(key === "page" && value === "1"));
}

export async function taxonomyMetadata(kind: "category" | "technology" | "country", slug: string, search: Search): Promise<Metadata> {
  const result = await Promise.all([getCatalog(), getDiscovery()]).catch(() => null);
  if (!result) return { title: "Website collection", robots: { index: false, follow: true } };
  const [catalog, discovery] = result;
  const item = kind === "country" ? catalog.countries.find((row) => row.code.toLowerCase() === slug.toLowerCase())
    : kind === "category" ? catalog.categories.find((row) => row.slug === slug) : catalog.technologies.find((row) => row.slug === slug);
  if (!item) return { title: "Collection not found", robots: { index: false, follow: false } };
  const nonempty = kind === "country" ? discovery.countries.some((row) => row.code.toLowerCase() === slug.toLowerCase())
    : kind === "category" ? discovery.categories.some((row) => row.slug === slug) : discovery.technologies.some((row) => row.slug === slug);
  const section = kind === "country" ? "countries" : kind === "category" ? "categories" : "technologies";
  const title = kind === "country" ? `Websites from ${item.name}` : kind === "technology" ? `Websites built with ${item.name}` : `${item.name} websites`;
  const description = `Discover ${title.charAt(0).toLowerCase() + title.slice(1)} and compare their recorded mobile performance on TheFastestWeb.`;
  const canonical = `/${section}/${encodeURIComponent(kind === "country" ? slug.toLowerCase() : slug)}`;
  return { title, description, alternates: { canonical }, robots: { index: nonempty && !hasDirectoryFilters(search), follow: true }, openGraph: { title, description, url: canonical, type: "website" } };
}
