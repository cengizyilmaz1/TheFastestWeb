import type { Metadata } from "next";
import { TaxonomyPage } from "@/components/directory/TaxonomyPage";
import { taxonomyMetadata } from "@/modules/seo/directory-metadata";
export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  return taxonomyMetadata("category", (await params).slug, await searchParams);
}
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaxonomyPage kind="category" slug={(await params).slug} search={await searchParams} />;
}
