import type { Metadata } from "next";
import { TaxonomyPage } from "@/components/directory/TaxonomyPage";
export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params; return { title: "Websites by category", alternates: { canonical: "/categories/" + category } };
}
export default async function Page({ params, searchParams }: { params: Promise<{ category: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TaxonomyPage kind="category" slug={(await params).category} search={await searchParams} />;
}
