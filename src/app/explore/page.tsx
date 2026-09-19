import type { Metadata } from "next";
import { DirectoryView } from "@/components/directory/DirectoryView";
import { directorySchema } from "@/modules/sites/directory";
import { hasDirectoryFilters } from "@/modules/seo/directory-metadata";
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  return { title: "Explore websites", description: "Discover websites by category, country and recorded performance.", alternates: { canonical: "/explore" }, robots: { index: !hasDirectoryFilters(await searchParams), follow: true } };
}
export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = directorySchema.safeParse(await searchParams);
  return <DirectoryView query={parsed.success ? parsed.data : {}} />;
}
