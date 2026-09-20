import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import { UnsubscribeForm } from "@/components/privacy/UnsubscribeForm";
import { LegalPage } from "@/components/content/LegalPage";
import { publicPages } from "@/content/public-pages";

const page = publicPages.privacy;
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await searchParams;
  const privateQuery = Object.hasOwn(query, "unsubscribe");
  return { ...pageMetadata({ title: page.title, description: page.description, path: page.path, index: !privateQuery, follow: !privateQuery }),
    ...(privateQuery ? { referrer: "no-referrer" as const } : {}) };
}

export default async function PrivacyPage({ searchParams }: Props) {
  const query = await searchParams;
  const token = typeof query.unsubscribe === "string" ? query.unsubscribe.slice(0, 1024) : "";
  return <LegalPage page={page}>{token ? <UnsubscribeForm token={token} /> : null}</LegalPage>;
}
