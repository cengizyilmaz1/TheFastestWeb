import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRightIcon, GlobeHemisphereWestIcon } from "@phosphor-icons/react/dist/ssr";
import { getSiteProfile } from "@/modules/sites/profile";
import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { HistoryChart } from "@/components/site-detail/HistoryChart";
import { EmptyState } from "@/components/directory/WebsiteList";
import { CopyBadge } from "@/components/site-detail/CopyBadge";
import { listSiteAwards } from "@/modules/awards/service";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getSiteProfile((await params).slug);
  if (!data) return { title: "Website report", robots: { index: false } };
  return { title: data.site.name + " — performance report", description: data.site.description,
    alternates: { canonical: "/site/" + data.site.slug }, ...(!data.site.isListed || data.site.archivedAt || !["active", "verified", "unreachable", "redirected", "parked"].includes(data.site.lifecycle) ? { robots: { index: false, follow: false } } : {}) };
}
const milliseconds = (value: number | null | undefined) => value === null || value === undefined ? "—" : value >= 1000 ? (value / 1000).toFixed(2) + "s" : value + "ms";

export default async function SitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ strategy?: string; method?: string }> }) {
  const { slug } = await params, query = await searchParams, strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const data = await getSiteProfile(slug, strategy, query.method);
  if (!data) notFound();
  const { site, latest, history } = data;
  const awards = await listSiteAwards(site.id, { limit: 12 });
  const metrics = [["Performance", latest ? latest.score + " / 100" : "—"], ["Largest contentful paint", milliseconds(latest?.lcpMs)], ["Layout shift", latest?.cls?.toFixed(3) ?? "—"], ["Total blocking time", milliseconds(latest?.tbtMs)]];
  const badgeSlug = encodeURIComponent(site.slug);
  const code = '<a href="' + siteConfig.url + "/site/" + badgeSlug + '"><img src="' + siteConfig.url + "/api/badge/" + badgeSlug + '" alt="Website performance on TheFastestWeb" width="240" height="60" /></a>';
  return <div className="page-shell mx-auto max-w-[1120px]">
    <nav aria-label="Breadcrumb" className="mb-9 flex items-center gap-2 text-xs text-text-muted"><Link href="/explore" className="hover:text-accent">Websites</Link><span>/</span><span>{site.name}</span></nav>
    <section className="flex flex-col justify-between gap-6 border-b border-border pb-9 md:flex-row md:items-start">
      <div className="flex gap-5"><span className="hidden h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-border bg-bg-main text-accent sm:flex"><GlobeHemisphereWestIcon size={32} aria-hidden /></span><div><p className="page-eyebrow mb-3">{site.lifecycle}{site.countryCode ? " · " + site.countryCode : ""}{!site.isListed ? " · Private listing" : ""}</p><h1 className="page-title">{site.name}</h1><p className="page-description mt-4">{site.tagline || site.description}</p><div className="mt-5 flex flex-wrap gap-2">{data.categories.map((row) => <Link href={"/categories/" + row.slug} key={row.slug} className="rounded-md border border-border px-2.5 py-1 text-xs text-text-secondary hover:border-border-light">{row.name}</Link>)}</div></div></div>
      <a href={site.url} target="_blank" rel="ugc noopener noreferrer" className="button-primary shrink-0 self-start">Visit website <ArrowUpRightIcon size={18} aria-hidden /></a>
    </section>
    {site.lifecycle !== "active" && site.lifecycle !== "verified" && <p className="my-5 rounded-lg border border-border bg-bg-main p-4 text-sm text-text-secondary">This website is marked {site.lifecycle}. Its recorded measurements remain available below.</p>}
    <div className="my-7 flex flex-wrap items-end justify-between gap-4"><nav aria-label="Device measurements" className="flex gap-2"><Link href={"?strategy=mobile"} className={strategy === "mobile" ? "button-primary" : "button-secondary"}>Mobile</Link><Link href={"?strategy=desktop"} className={strategy === "desktop" ? "button-primary" : "button-secondary"}>Desktop</Link></nav>
      <form className="flex items-end gap-2"><input type="hidden" name="strategy" value={strategy} /><label className="text-xs text-text-secondary">Measurement method<select name="method" className="form-field mt-1" defaultValue={latest?.methodologyVersion}>{data.methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><button className="button-secondary" type="submit">View</button></form>
    </div>
    <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-main md:grid-cols-4 md:divide-y-0">{metrics.map(([label, value], index) => <div key={label} className="p-5"><p className="text-xs text-text-secondary">{label}</p><p className={"mt-4 font-mono text-2xl tracking-tight " + (index === 0 && latest && latest.score >= 90 ? "text-green" : "")}>{value}</p></div>)}</div>
    <p className="mb-8 mt-4 text-xs leading-relaxed text-text-muted">{latest ? "Measured " + latest.testedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC · " + latest.sampleCount + " sample" + (latest.sampleCount === 1 ? "" : "s") + " · " + latest.methodologyVersion : "No recorded measurements for this device."} · Lab data, not field Core Web Vitals. <Link href="/methodology" className="underline underline-offset-4">About these numbers</Link></p>
    {latest ? <><HistoryChart data={history} currentScore={latest.score} trend={history.length > 1 && history[0].score > 0 ? Math.round((latest.score - history[0].score) / history[0].score * 100) : 0} /><p className="mt-2 text-xs text-text-muted">Up to 365 recorded results for this device and method. Change compares the latest result with the first shown.</p></> : <EmptyState title="No measurements yet" description="Once this device has been tested, its performance history will appear here." />}
    {awards.items.length > 0 && <section className="mt-10"><h2 className="mb-5 text-2xl font-medium">Earned achievements</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{awards.items.map((award) => <article key={award.id} className="rounded-xl border border-border bg-accent-glow p-5"><h3 className="font-medium">{award.title}</h3><p className="mt-2 text-xs leading-relaxed text-text-secondary">{award.description}</p><p className="mt-4 font-mono text-[11px] text-text-muted">{award.awardedAt.toISOString().slice(0, 10)} UTC</p></article>)}</div></section>}
    <div className="mt-12 grid gap-10 lg:grid-cols-[1.4fr_1fr]"><section><h2 className="text-2xl font-medium tracking-tight">About the website</h2><p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-text-secondary">{site.description}</p>
      {data.screenshot?.url && <figure className="mt-6"><Image unoptimized src={data.screenshot.url} alt={"Preview of " + site.name} width={data.screenshot.width} height={data.screenshot.height} className="max-h-[480px] w-full rounded-xl border border-border object-cover object-top" /><figcaption className="mt-2 text-xs text-text-muted">Captured {data.screenshot.capturedAt.toISOString().slice(0, 10)} UTC</figcaption></figure>}
      {!!data.technologies.length && <div className="mt-6"><h3 className="mb-3 text-sm font-medium">Built with</h3><div className="flex flex-wrap gap-2">{data.technologies.map((row) => <Link className="button-secondary" href={"/technologies/" + row.slug} key={row.slug}>{row.name}</Link>)}</div></div>}
    </section><aside><h2 className="text-xl font-medium">The people behind it</h2>{data.founders.length ? <div className="mt-4 space-y-3">{data.founders.map((row) => <Link key={row.slug} href={"/founders/" + row.slug} className="block rounded-lg border border-border p-4 text-sm hover:text-accent">{row.name} ↗</Link>)}</div> : <p className="mt-3 text-sm text-text-muted">No public founder profile linked yet.</p>}<Link href={"/claim?site=" + site.id} className="mt-6 inline-block text-sm text-text-secondary underline underline-offset-4">Is this your website?</Link></aside></div>
    {site.isListed && <section className="mt-12 border-t border-border pt-8"><CopyBadge code={code} /></section>}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "WebPage", name: site.name + " performance report", description: site.description, url: siteConfig.url + "/site/" + site.slug, mainEntity: { "@type": "WebSite", name: site.name, url: site.url } }) }} />
  </div>;
}
