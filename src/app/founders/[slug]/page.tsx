import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicFounder } from "@/modules/founders/service";
import { EmptyState } from "@/components/directory/WebsiteList";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/config/site";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const profile = await getPublicFounder((await params).slug).catch(() => null);
  return profile ? { title: profile.name, description: profile.bio || `Explore websites by ${profile.name}.`, alternates: { canonical: `/founders/${profile.slug}` } } : { title: "Founder profile", robots: { index: false } };
}
export default async function FounderPage({ params }: { params: Promise<{ slug: string }> }) {
  const profile = await getPublicFounder((await params).slug);
  if (!profile) notFound();
  return <div className="page-shell mx-auto max-w-[960px]"><Link className="text-sm text-text-secondary hover:text-accent" href="/founders">← All founders</Link>
    <div className="mt-10 border-b border-border pb-10"><p className="page-eyebrow mb-4">Founder profile{profile.countryCode ? ` · ${profile.countryCode}` : ""}</p><h1 className="page-title">{profile.name}</h1>{profile.bio && <p className="page-description mt-5 whitespace-pre-line">{profile.bio}</p>}
      <div className="mt-6 flex flex-wrap gap-3">{profile.websiteUrl && <a href={profile.websiteUrl} className="button-secondary" target="_blank" rel="ugc noopener noreferrer">Website ↗</a>}{profile.socialLinks.map((link) => <a key={link.platform} href={link.url} className="button-secondary capitalize" target="_blank" rel="ugc noopener noreferrer">{link.platform} ↗</a>)}</div>
    </div><h2 className="mt-10 mb-6 text-2xl font-medium tracking-tight">Published websites</h2>
    {!profile.sites.length ? <EmptyState title="More to come" description="This founder has not linked a public website yet." /> : <div className="divide-y divide-border">{profile.sites.map((site) => <Link href={`/site/${site.slug}`} key={site.id} className="flex items-center justify-between gap-4 py-6 text-lg hover:text-accent"><span>{site.name}</span><span className="text-sm text-text-muted">View website ↗</span></Link>)}</div>}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "Person", name: profile.name, url: `${siteConfig.url}/founders/${profile.slug}`, description: profile.bio || undefined, sameAs: profile.socialLinks.map((link) => link.url) }) }} />
  </div>;
}
