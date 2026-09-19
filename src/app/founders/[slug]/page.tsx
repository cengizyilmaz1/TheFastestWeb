import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFounder } from "@/modules/founders/service";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/config/site";
import { FounderSheet } from "./FounderSheet";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const profile = await getPublicFounder((await params).slug).catch(() => null);
  return profile ? { title: profile.name, description: profile.bio || `Explore websites by ${profile.name}.`, alternates: { canonical: `/founders/${profile.slug}` } } : { title: "Founder profile", robots: { index: false } };
}
export default async function FounderPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ strategy?: string }> }) {
  const strategy = (await searchParams).strategy === "desktop" ? "desktop" : "mobile";
  const profile = await getPublicFounder((await params).slug, strategy);
  if (!profile) notFound();
  return <>
    <FounderSheet profile={profile} strategy={strategy} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "ProfilePage", url: `${siteConfig.url}/founders/${profile.slug}`, mainEntity: { "@type": "Person", name: profile.name, url: `${siteConfig.url}/founders/${profile.slug}`, image:profile.avatarUrl || undefined, description: profile.bio || undefined, sameAs: profile.socialLinks.map((link) => link.url) } }) }} />
  </>;
}
