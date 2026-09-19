import { notFound } from "next/navigation";
import { getCatalog } from "@/modules/catalog/service";
import { directorySchema } from "@/modules/sites/directory";
import { DirectoryView } from "./DirectoryView";
import { EmptyState } from "./WebsiteList";

export async function TaxonomyPage({ kind, slug, search }: { kind: "category" | "technology" | "country"; slug: string; search: Record<string, string | string[] | undefined> }) {
  const catalog = await getCatalog().catch(() => null);
  if (!catalog) return <div className="page-shell"><EmptyState title="This collection is temporarily unavailable" description="We could not load the directory. Please try again shortly." /></div>;
  const item = kind === "country" ? catalog.countries.find((country) => country.code.toLowerCase() === slug.toLowerCase())
    : kind === "category" ? catalog.categories.find((category) => category.slug === slug) : catalog.technologies.find((technology) => technology.slug === slug);
  if (!item) notFound();
  const query = directorySchema.safeParse({ ...search, [kind]: kind === "country" ? slug.toUpperCase() : slug });
  const noun = kind === "country" ? `Websites from ${item.name}.` : kind === "technology" ? `Built with ${item.name}.` : `${item.name}, built for speed.`;
  const basePath = `/${kind === "country" ? "countries" : kind === "category" ? "categories" : "technologies"}/${slug}`;
  return <DirectoryView title={noun} query={query.success ? query.data : { [kind]: kind === "country" ? slug.toUpperCase() : slug }} basePath={basePath}
    description={kind === "country" ? "Country is chosen by each website owner. It describes the project, not its server location." : "Explore this collection using each website’s latest recorded mobile lab measurement."} />;
}
