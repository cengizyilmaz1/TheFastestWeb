import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRightIcon, ArrowsLeftRightIcon, CaretDownIcon, CaretRightIcon, LockSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { getSiteProfile } from "@/modules/sites/profile";
import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { HistoryChart } from "@/components/site-detail/HistoryChart";
import { MetricsGrid } from "@/components/site-detail/MetricsGrid";
import { ScoreReadout } from "@/components/site-detail/ScoreReadout";
import { EmptyState, monogram } from "@/components/directory/WebsiteList";
import { CopyBadge } from "@/components/site-detail/CopyBadge";
import { listSiteAwards } from "@/modules/awards/service";
import { normalizePublicUrl } from "@/lib/security/public-url";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const data = await getSiteProfile((await params).slug);
  if (!data) return { title: "Website report", robots: { index: false } };
  return { title: data.site.name + " — performance report", description: data.site.description,
    alternates: { canonical: "/site/" + data.site.slug }, ...(!data.site.isListed || data.site.archivedAt || !["active", "verified", "unreachable", "redirected", "parked"].includes(data.site.lifecycle) ? { robots: { index: false, follow: false } } : {}) };
}
const stamp = (value: Date) => value.toISOString().slice(0, 16).replace("T", " ") + " UTC";
const sentence = (value: string) => { const text = value.replaceAll("_", " "); return text.charAt(0).toUpperCase() + text.slice(1); };

export default async function SitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ strategy?: string; method?: string; captures?:string }> }) {
  const { slug } = await params, query = await searchParams, strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const data = await getSiteProfile(slug, strategy, query.method, query.captures);
  if (!data) notFound();
  const { site, latest, history } = data;
  const awards = await listSiteAwards(site.id, { limit: 12 });
  const publicSite=site.isListed&&!site.archivedAt&&["active","verified","unreachable","redirected","parked"].includes(site.lifecycle);
  let observedRedirect:string|null=null;
  try { if(site.redirectUrl){const normalized=normalizePublicUrl(site.redirectUrl);if(new URL(normalized).protocol==="https:")observedRedirect=normalized;} } catch { /* Invalid stored destinations never become links. */ }
  let host = site.url;
  try { host = new URL(site.url).hostname.replace(/^www\./, ""); } catch { /* The stored address is shown as it is. */ }
  const rankingHref=(row:typeof data.rankingPositions.items[number])=>`/leaderboard?${new URLSearchParams({kind:row.kind,strategy,scope:row.scope,scopeKey:row.scopeKey,...(row.periodKey?{periodKey:row.periodKey}:{})})}`;
  const captureHref=(cursor?:string)=>`?${new URLSearchParams({strategy,...(latest?{method:latest.methodologyVersion}:{}),...(cursor?{captures:cursor}:{})})}#screenshots`;
  const badgeSlug = encodeURIComponent(site.slug);
  const code = '<a href="' + siteConfig.url + "/site/" + badgeSlug + '"><img src="' + siteConfig.url + "/api/badge/" + badgeSlug + '" alt="Website performance on TheFastestWeb" width="240" height="60" /></a>';
  const healthy = site.lifecycle === "active" || site.lifecycle === "verified";
  const longName = site.name.length > 22;
  return <div className="page-shell mx-auto max-w-[1240px]">
    <nav aria-label="Breadcrumb" className="mb-8 flex min-w-0 items-center gap-1.5 text-[13px] text-text-muted sm:mb-10"><Link href="/explore" className="inline-flex min-h-8 items-center rounded-full font-medium text-text-secondary no-underline transition-colors hover:text-text-primary hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">Websites</Link><CaretRightIcon size={12} aria-hidden /><span aria-current="page" className="truncate">{site.name}</span></nav>

    <section className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,540px)] lg:items-start xl:gap-x-20">
      <div className="min-w-0 lg:pt-2">
        <div className="flex min-w-0 items-center gap-4"><span aria-hidden className="monogram h-14 w-14 rounded-2xl text-xl">{monogram(site.name)}</span><div className="min-w-0"><p className="truncate text-[15px] font-semibold text-text-primary">{host}</p><p className="mt-0.5 flex items-center gap-2 text-[13px] text-text-muted"><span aria-hidden className={"h-1.5 w-1.5 rounded-full " + (healthy ? "bg-green" : "bg-orange")} />{sentence(site.lifecycle)}</p></div></div>
        <h1 className={"page-title mt-7 break-words " + (longName ? "text-[clamp(1.9rem,3.4vw,3rem)] leading-[1.05]" : "")}>{site.name}</h1>
        <p className="page-description mt-5">{site.tagline || site.description}</p>
        {(data.categories.length > 0 || site.countryCode || !site.isListed) && <ul aria-label="Listing details" className="mt-6 flex flex-wrap gap-2">
          {data.categories.map((row) => <li key={row.slug}><Link href={"/categories/" + row.slug} className="chip">{row.name}</Link></li>)}
          {site.countryCode && <li><span className="chip"><span className="sr-only">Country </span>{site.countryCode}</span></li>}
          {!site.isListed && <li><span className="chip"><LockSimpleIcon size={14} aria-hidden />Private listing</span></li>}
        </ul>}
        <div className="mt-9 flex flex-wrap items-center gap-3"><a href={site.url} target="_blank" rel="ugc noopener noreferrer" className="button-primary min-h-12 px-6 text-[15px] max-sm:w-full">Visit website <ArrowUpRightIcon size={18} weight="bold" aria-hidden /></a>{publicSite&&<Link href={`/compare?left=${site.slug}`} className="button-secondary min-h-12 px-6 text-[15px] max-sm:w-full"><ArrowsLeftRightIcon size={18} aria-hidden />Compare website</Link>}</div>
      </div>

      <div className="panel relative min-w-0 overflow-hidden">
        <div aria-hidden className="dot-grid absolute inset-x-0 top-0 h-52 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative px-5 pb-7 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-[15px] font-semibold tracking-[-.01em]">Performance score</h2>
            <nav aria-label="Device measurements" className="flex gap-1.5"><Link href={"?strategy=mobile"} aria-current={strategy === "mobile" ? "page" : undefined} className="chip">Mobile</Link><Link href={"?strategy=desktop"} aria-current={strategy === "desktop" ? "page" : undefined} className="chip">Desktop</Link></nav>
          </div>
          <div className="mt-9 sm:mt-11"><ScoreReadout score={latest ? latest.score : null} /></div>
        </div>
        {latest ? <dl className="relative flex flex-wrap gap-x-10 gap-y-4 border-t border-border bg-bg-card/50 px-5 py-5 text-[13px] sm:px-8">
          <div><dt className="text-text-muted">Measured</dt><dd className="stat-value mt-1 text-sm text-text-primary">{stamp(latest.testedAt)}</dd></div>
          <div><dt className="text-text-muted">Samples</dt><dd className="stat-value mt-1 text-sm text-text-primary">{latest.sampleCount}</dd></div>
          <div className="min-w-0"><dt className="text-text-muted">Method</dt><dd className="mt-1 truncate text-sm font-medium text-text-primary">{latest.methodologyVersion}</dd></div>
        </dl> : <p className="relative border-t border-border bg-bg-card/50 px-5 py-5 text-sm leading-relaxed text-text-secondary sm:px-8">No recorded measurements for this device. Switch device above to check the other strategy.</p>}
      </div>
    </section>

    {(!healthy || observedRedirect) && <div className="mt-10 grid gap-3">
      {!healthy && <p className="panel-quiet flex items-start gap-3 rounded-2xl px-5 py-4 text-sm leading-relaxed text-text-secondary"><WarningCircleIcon size={20} className="mt-0.5 shrink-0 text-orange" aria-hidden /><span>This website is marked {site.lifecycle}. Its recorded measurements remain available below.</span></p>}
      {observedRedirect&&<p className="panel-quiet flex items-start gap-3 rounded-2xl px-5 py-4 text-sm leading-relaxed text-text-secondary"><ArrowUpRightIcon size={20} className="mt-0.5 shrink-0 text-text-muted" aria-hidden /><span className="min-w-0 break-words">Observed redirect: <a href={observedRedirect} target="_blank" rel="ugc noopener noreferrer" className="font-medium text-text-primary underline decoration-brand decoration-2 underline-offset-4 hover:decoration-text-primary">{observedRedirect}</a>. The original listing and its history remain unchanged.</span></p>}
    </div>}

    <nav aria-label="Report sections" className="mt-10 flex flex-wrap items-center gap-2 border-y border-border py-4 sm:mt-12">
      <span className="mr-3 text-[13px] font-semibold text-text-secondary">In this report</span>
      <a href="#lab-metrics" className="chip">Lab metrics</a>
      {latest && <a href="#score-history" className="chip">Score history</a>}
      <a href="#ranking-positions" className="chip">Rankings</a>
      <a href="#website-about" className="chip">About</a>
      <a href="#screenshots" className="chip">Screenshots</a>
    </nav>

    <section id="lab-metrics" className="mt-14 scroll-mt-28 sm:mt-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div><h2 className="section-title">Lab metrics</h2><p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-text-secondary">{latest ? "Each result sits on its own threshold rule." : "No recorded measurements for this device."} Lab data, not field Core Web Vitals. <Link href="/methodology" className="link-underline">About these numbers</Link></p></div>
        {data.methods.length > 0 && <form className="flex items-end gap-2"><input type="hidden" name="strategy" value={strategy} /><label className="text-[13px] font-medium text-text-secondary">Measurement method<span className="relative mt-1.5 block"><select name="method" className="form-field min-w-[200px] cursor-pointer appearance-none truncate rounded-full pl-5 pr-10" defaultValue={latest?.methodologyVersion}>{data.methods.map((method) => <option key={method} value={method}>{method}</option>)}</select><CaretDownIcon size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" /></span></label><button className="button-secondary min-h-[46px] text-sm! font-semibold!" type="submit">View</button></form>}
      </div>
      {latest ? <MetricsGrid caption={`Latest ${strategy} lab metrics for ${site.name}`} metrics={{ lcpMs: latest.lcpMs, cls: latest.cls, tbtMs: latest.tbtMs, fcpMs: latest.fcpMs, siMs: latest.siMs, ttiMs: latest.ttiMs }} loadTimeMs={latest.loadTimeMs} />
        : <EmptyState title="No measurements yet" description="Once this device has been tested, its lab metrics and performance history will appear here." href={"?strategy=" + (strategy === "mobile" ? "desktop" : "mobile")} action={strategy === "mobile" ? "View desktop results" : "View mobile results"} />}
    </section>

    {latest && <section id="score-history" className="mt-20 scroll-mt-28 sm:mt-28">
      <div className="mb-8"><h2 className="section-title">Score history</h2><p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-text-secondary">Up to 365 recorded results for this device and method. Change compares the latest result with the first shown.</p></div>
      <HistoryChart data={history} currentScore={latest.score} trend={history.length > 1 && history[0].score > 0 ? Math.round((latest.score - history[0].score) / history[0].score * 100) : 0} />
    </section>}

    <section id="ranking-positions" className="mt-20 scroll-mt-28 sm:mt-28">
      <h2 className="section-title">Current ranking positions</h2>
      <div className="mt-8 grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {data.rankingPositions.items.length?<table className="w-full table-fixed border-collapse text-left text-sm"><caption className="sr-only">Current {strategy} ranking positions</caption><colgroup><col /><col className="w-[34%]" /><col className="w-20 sm:w-28" /></colgroup><thead className="border-b border-border-light text-xs text-text-muted"><tr><th scope="col" className="py-3 pr-4 font-medium">Period</th><th scope="col" className="px-3 py-3 font-medium">Collection</th><th scope="col" className="py-3 pl-3 text-right font-medium">Position</th></tr></thead><tbody>{data.rankingPositions.items.map(row=><tr key={`${row.kind}:${row.scope}:${row.scopeKey}`} className="group border-b border-border transition-colors hover:bg-bg-main"><td className="py-4 pr-4"><Link href={rankingHref(row)} className="inline-flex min-h-8 flex-wrap items-baseline gap-x-2.5 font-semibold text-text-primary no-underline group-hover:underline group-hover:decoration-brand group-hover:decoration-2 group-hover:underline-offset-4">{sentence(row.kind)}{row.periodKey&&<span className="stat-value text-xs font-normal text-text-muted">{row.periodKey}</span>}</Link></td><td className="px-3 py-4 text-text-secondary"><span className="break-words">{sentence(row.scope)}{row.scopeKey&&<span className="ml-2 text-text-muted">{row.scopeKey}</span>}</span></td><td className="stat-value py-4 pl-3 text-right text-xl font-medium text-text-primary"><span className="text-sm font-normal text-text-muted">#</span>{row.rank}</td></tr>)}</tbody></table>
            :<p className="dot-grid rounded-2xl border border-dashed border-border-light px-6 py-10 text-sm leading-relaxed text-text-secondary">No current eligible public ranking for this device. Private, inactive and legacy-only measurements do not receive a competitive position.</p>}
          <p className="mt-5 max-w-[72ch] text-[13px] leading-relaxed text-text-muted">{sentence(strategy)}, {data.rankingPositions.performanceMethodVersion}, {data.rankingPositions.rankingAlgorithmVersion}. Weekly and monthly positions use the latest complete result in the current UTC period; all-time uses the best eligible result. These positions stay separate from the selected historical method above.</p>
        </div>
        <dl className="min-w-0 self-start border-t border-border">
          <div className="border-b border-border py-6"><dt className="text-[15px] font-semibold text-text-primary">Recorded 90+ streak</dt><dd className="mt-3">{data.streak.days?<p className="flex items-baseline gap-2.5"><span className="stat-value text-4xl font-medium leading-none text-green">{data.streak.days}</span><span className="text-sm text-text-secondary">consecutive UTC day{data.streak.days===1?"":"s"}</span></p>:<p className="text-lg font-semibold tracking-[-.02em] text-text-primary">No qualifying streak</p>}<p className="mt-3 text-[13px] leading-relaxed text-text-muted">Latest complete {strategy} batch per day, {data.streak.method}.{data.streak.endDay?` Ending ${data.streak.endDay}; missing days break the streak.`:" Legacy or incomplete measurements are not counted."}</p></dd></div>
          <div className="border-b border-border py-6"><dt className="text-[15px] font-semibold text-text-primary">Badge verification</dt><dd className="mt-3"><p className="flex items-center gap-2.5 text-lg font-semibold tracking-[-.02em] text-text-primary"><span aria-hidden className={"h-2 w-2 rounded-full " + (site.badgeStatus === "verified" ? "bg-green" : site.badgeStatus === "failed" ? "bg-red" : site.badgeStatus === "missing" ? "bg-text-muted" : "bg-orange")} />{sentence(site.badgeStatus)}</p><p className="mt-3 text-[13px] leading-relaxed text-text-muted">{site.badgeRequired?"A listing badge is required.":"A listing badge is not required for this website."} {site.badgeCheckedAt?`Last checked ${site.badgeCheckedAt.toISOString().slice(0,16).replace("T"," ")} UTC.`:"No completed badge check is recorded."}</p>{site.badgeGraceUntil&&site.badgeStatus==="grace_period"&&<p className="mt-2 text-[13px] leading-relaxed text-text-muted">Grace period ends {site.badgeGraceUntil.toISOString().slice(0,10)} UTC.</p>}</dd></div>
        </dl>
      </div>
    </section>

    {awards.items.length > 0 && <section className="mt-20 sm:mt-28"><h2 className="section-title">Earned achievements</h2><div className="mt-8 border-t border-border">{awards.items.map((award) => <article key={award.id} className="grid gap-x-10 gap-y-1.5 border-b border-border py-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"><h3 className="text-xl font-semibold leading-snug tracking-[-.03em]">{award.title}</h3><p className="stat-value text-xs text-text-muted sm:text-right">{award.awardedAt.toISOString().slice(0, 10)} UTC</p><p className="max-w-[64ch] text-sm leading-relaxed text-text-secondary sm:col-span-2">{award.description}</p></article>)}</div></section>}

    <div className="mt-20 grid gap-x-16 gap-y-14 sm:mt-28 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"><section id="website-about" className="min-w-0 scroll-mt-28"><h2 className="section-title">About the website</h2><p className="mt-6 max-w-[64ch] whitespace-pre-line break-words text-base leading-[1.75] text-text-secondary">{site.description}</p>
      {!!data.technologies.length && <div className="mt-9"><h3 className="mb-3.5 text-[15px] font-semibold">Built with</h3><ul className="flex flex-wrap gap-2">{data.technologies.map((row) => <li key={row.slug}><Link className="chip" href={"/technologies/" + row.slug}>{row.name}</Link></li>)}</ul></div>}
    </section><aside className="min-w-0 lg:pt-3"><h2 className="text-xl font-semibold tracking-[-.03em]">The people behind it</h2>{data.founders.length ? <ul className="mt-5 border-t border-border">{data.founders.map((row) => <li key={row.slug} className="border-b border-border"><Link href={"/founders/" + row.slug} className="group flex min-h-16 items-center gap-3.5 no-underline"><span aria-hidden className="monogram h-10 w-10 rounded-full text-sm transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(row.name)}</span><span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{row.name}</span><ArrowUpRightIcon size={18} className="shrink-0 text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary" aria-hidden /></Link></li>)}</ul> : <p className="mt-4 border-y border-border py-5 text-sm leading-relaxed text-text-secondary">No public founder profile linked yet.</p>}<p className="mt-6 text-sm"><Link href={"/claim?site=" + site.id} className="link-underline">Is this your website?</Link></p></aside></div>

    <section id="screenshots" className="mt-20 scroll-mt-24 sm:mt-28"><h2 className="section-title">Screenshot history</h2><p className="mb-8 mt-3 max-w-[72ch] text-[15px] leading-relaxed text-text-secondary">Retained {strategy} captures, newest first. Capture timestamps describe the image; they are independent of speed-test scores. Images may reflect previous versions of this website.</p>{data.screenshots.length?<div className="grid gap-x-8 gap-y-10 sm:grid-cols-2">{data.screenshots.map(capture=><figure key={capture.id} className="min-w-0"><a href={capture.url} target="_blank" rel="noopener noreferrer" className="group block overflow-hidden rounded-2xl border border-border bg-bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-text-primary active:translate-y-0"><Image unoptimized loading="lazy" src={capture.url} alt={`${site.name} ${capture.device} capture from ${capture.capturedAt.toISOString().slice(0,10)}`} width={capture.width} height={capture.height} className="max-h-[420px] w-full object-cover object-top" /></a><figcaption className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-text-muted"><span className="stat-value text-text-secondary">{capture.capturedAt.toISOString().slice(0,16).replace("T"," ")} UTC</span><span className="capitalize">{capture.device}</span><span>{capture.mode==="fullpage"?"Full page":"Viewport"}</span></figcaption></figure>)}</div>:<p className="dot-grid rounded-2xl border border-dashed border-border-light px-6 py-10 text-sm leading-relaxed text-text-secondary">No retained captures for this device. Screenshots appear only after a successful capture; no preview is fabricated.</p>}{(data.nextScreenshotCursor||query.captures)&&<div className="mt-8 flex flex-wrap gap-3">{data.nextScreenshotCursor&&<Link className="button-secondary" href={captureHref(data.nextScreenshotCursor)}>Older captures</Link>}{query.captures&&<Link className="button-secondary" href={captureHref()}>Latest captures</Link>}</div>}</section>

    {publicSite && <section className="mt-20 sm:mt-28"><CopyBadge code={code} /></section>}
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "WebPage", name: site.name + " performance report", description: site.description, url: siteConfig.url + "/site/" + site.slug, mainEntity: { "@type": "WebSite", name: site.name, url: site.url } }) }} />
  </div>;
}
