import type { Metadata } from "next";
import { TaxonomyPage } from "@/components/directory/TaxonomyPage";
import { taxonomyMetadata } from "@/modules/seo/directory-metadata";
export async function generateMetadata({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  return taxonomyMetadata("country", (await params).code, await searchParams);
}
export default async function Page({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaxonomyPage kind="country" slug={(await params).code} search={await searchParams} />;
}
