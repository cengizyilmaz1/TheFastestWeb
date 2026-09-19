import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon, MedalIcon } from "@phosphor-icons/react/dist/ssr";
import type { getPublicFounder } from "@/modules/founders/service";
import { EmptyState, monogram } from "@/components/directory/WebsiteList";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";
import { FounderAvatar, countryName } from "../FounderAvatar";

export type PublicFounder = NonNullable<Awaited<ReturnType<typeof getPublicFounder>>>;

const date = (value: string | Date) => new Date(value).toISOString().slice(0, 10);
const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const heading = "section-title text-[clamp(1.5rem,2.3vw,2rem)]";
const quiet = "text-sm leading-relaxed text-text-secondary";

/** A profile sheet: who they are, the numbers on a dark timing board, then the work and its record. */
export function FounderSheet({ profile, strategy }: { profile: PublicFounder; strategy: "mobile" | "desktop" }) {
  const { insights } = profile;
  const country = countryName(profile.countryCode);
  const links = [...(profile.websiteUrl ? [{ label: "Website", url: profile.websiteUrl }] : []), ...profile.socialLinks.map((link) => ({ label: link.platform, url: link.url }))];
  const about = Boolean(profile.bio) || links.length > 0;
  const facts = [
    ...(country ? [["Country", country]] : []),
    ["Profile since", new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(profile.createdAt))],
    ["Public websites", String(profile.sites.length)],
  ];
  const summary: { label: string; value: string | number; tone?: string }[] = [
    { label: "Measured websites", value: insights.measuredSites },
    { label: "Average latest score", value: insights.averageScore ?? "—", tone: scoreTone(insights.averageScore, insights.averageScore !== null) },
    { label: "Weekly overall wins", value: insights.weeklyWins },
    { label: "Best overall finish", value: insights.bestRank ? `#${insights.bestRank}` : "—" },
  ];

  return <div className="page-shell mx-auto max-w-[1240px]">
    <Link className="group inline-flex min-h-9 items-center gap-2 text-sm font-medium text-text-secondary no-underline transition-colors hover:text-text-primary" href="/founders"><ArrowLeftIcon size={16} aria-hidden className="transition-transform group-hover:-translate-x-1" />All founders</Link>

    <header className="mt-8 grid gap-x-9 gap-y-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-end">
      <FounderAvatar name={profile.name} avatarUrl={profile.avatarUrl} size="lg" />
      <div className="min-w-0"><p className="page-eyebrow mb-3 sm:mb-4">Founder profile</p><h1 className="page-title [overflow-wrap:anywhere]">{profile.name}</h1></div>
    </header>
    <div className={"mt-9 grid gap-x-16 gap-y-9 sm:mt-12" + (about ? " lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : "")}>
      {about && <div>
        {profile.bio && <p className="page-description whitespace-pre-line">{profile.bio}</p>}
        {links.length > 0 && <ul className={"flex flex-wrap gap-2.5" + (profile.bio ? " mt-7" : "")}>{links.map((link) => <li key={link.label + link.url}>
          <a href={link.url} className="button-secondary capitalize" target="_blank" rel="ugc noopener noreferrer">{link.label} <ArrowUpRightIcon size={15} weight="bold" aria-hidden /></a>
        </li>)}</ul>}
      </div>}
      <dl className={"self-end text-[15px]" + (about ? "" : " max-w-[560px]")}>{facts.map(([term, value]) => <div key={term} className="flex items-baseline justify-between gap-6 border-t border-border py-3.5 last:border-b"><dt className="text-text-secondary">{term}</dt><dd className="text-right font-semibold text-text-primary">{value}</dd></div>)}</dl>
    </div>

    <section aria-labelledby="founder-performance" className="relative mt-14 overflow-hidden rounded-[28px] border border-border bg-bg-main text-text-primary shadow-pop sm:mt-20">
      <div aria-hidden className="dot-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
      <div className="relative px-5 pt-6 sm:px-9 sm:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
          <div><h2 id="founder-performance" className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">Performance at a glance</h2><p className="mt-1.5 text-sm text-text-muted">Latest complete {strategy} lab measurements, two samples per website.</p></div>
          <nav aria-label="Founder performance device" className="inline-flex items-center gap-1 rounded-full border border-border-light bg-bg-main p-1">{(["mobile", "desktop"] as const).map((device) => <Link key={device} href={`?strategy=${device}`} aria-current={strategy === device ? "page" : undefined}
            className={"inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold capitalize no-underline transition-colors active:scale-[.98] " + (strategy === device ? "bg-text-primary text-bg-main" : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary")}>{device}</Link>)}</nav>
        </div>
        <dl className="mt-8 grid grid-cols-2 border-t border-border lg:grid-cols-4">{summary.map(({ label, value, tone }, index) => <div key={label} className={"border-border py-6 sm:py-7 " + (index % 2 ? "border-l pl-5 sm:pl-7 " : "") + (index < 2 ? "border-b lg:border-b-0 " : "") + (index === 2 ? "lg:border-l lg:pl-7" : "")}>
          <dt className="text-[13px] text-text-muted">{label}</dt>
          <dd className={"stat-value mt-3 text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-none " + (tone ?? "text-text-primary")}>{value}</dd>
        </div>)}</dl>
        {insights.bestSite ? <div className="grid items-center gap-x-6 gap-y-3 border-t border-border py-6 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)_auto]">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden className="monogram">{monogram(insights.bestSite.name)}</span>
            <div className="min-w-0"><p className="text-[13px] text-text-muted">Best performing website</p><Link className="group mt-0.5 inline-flex max-w-full items-center gap-1.5 text-lg font-semibold text-text-primary no-underline hover:underline hover:decoration-brand hover:decoration-[3px] hover:underline-offset-4" href={`/site/${insights.bestSite.slug}?strategy=${strategy}`}><span className="truncate">{insights.bestSite.name}</span><ArrowUpRightIcon size={16} aria-hidden className="flex-none" /></Link></div>
          </div>
          <ScoreTicks score={insights.bestSite.score} className="hidden lg:block" />
          <p className="flex items-baseline gap-3 sm:justify-end"><span className={"stat-value text-3xl font-medium " + scoreTone(insights.bestSite.score)}>{insights.bestSite.score}<span className="sr-only"> out of 100</span></span><span className="text-xs text-text-muted">Measured <span className="stat-value">{date(insights.bestSite.testedAt)}</span> UTC</span></p>
        </div> : <p className="border-t border-border py-6 text-sm leading-relaxed text-text-secondary">No complete measurements under the current method for this device yet. Historical results remain on individual website reports.</p>}
      </div>
      <div className="relative flex flex-col gap-x-10 gap-y-2 border-t border-border px-5 py-4 text-[13px] leading-relaxed text-text-muted sm:px-9 lg:flex-row lg:items-center lg:justify-between">
        <p className="max-w-[92ch]">The average gives each measured website equal weight. Up to 100 currently public, active linked websites are shown. Historical or incomplete methods do not enter this summary.</p>
        <Link href="/methodology" className="inline-flex min-h-8 shrink-0 items-center gap-1.5 font-medium text-text-secondary no-underline transition-colors hover:text-text-primary">Method {insights.methodologyVersion}, ranking {insights.rankingAlgorithmVersion} <ArrowUpRightIcon size={14} aria-hidden /></Link>
      </div>
    </section>

    <div className="mt-16 grid gap-x-16 gap-y-16 sm:mt-24 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-16 sm:space-y-20">
        <section aria-labelledby="founder-websites">
          <h2 id="founder-websites" className={heading + " mb-7"}>Published websites</h2>
          {!profile.sites.length ? <EmptyState title="More to come" description="This founder has not linked a public website yet." /> : <ul className="border-t border-border-light">{profile.sites.map((site) => <li key={site.id} className="border-b border-border">
            <Link href={`/site/${site.slug}`} className="group flex items-center gap-4 py-4 no-underline transition-colors hover:bg-bg-main">
              <span aria-hidden className="monogram transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(site.name)}</span>
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-text-primary">{site.name}</span><span className="mt-0.5 block truncate text-[13px] text-text-muted">{host(site.url)}</span></span>
              {insights.bestSite?.siteId === site.id && <span className="hidden text-[13px] text-text-secondary sm:block">Best {strategy} score</span>}
              <span aria-hidden className="icon-button transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"><ArrowUpRightIcon size={18} /></span>
              <span className="sr-only">View website report</span>
            </Link>
          </li>)}</ul>}
        </section>

        <section aria-labelledby="founder-rankings">
          <h2 id="founder-rankings" className={heading}>Ranking history</h2>
          <p className={quiet + " mb-6 mt-3 max-w-[62ch]"}>Up to 24 recent finalized placements. Weekly wins and best finish count overall competitions; collection placements are labeled separately.</p>
          {insights.rankings.length ? <table className="w-full table-fixed border-collapse text-left text-sm">
            <caption className="sr-only">Finalized {strategy} rankings for this founder&apos;s public websites</caption>
            <colgroup><col className="w-24 sm:w-32" /><col /><col className="hidden w-[30%] sm:table-column" /><col className="w-16" /></colgroup>
            <thead className="border-b border-border-light text-xs text-text-muted"><tr><th scope="col" className="py-3 pr-4 font-medium">Period</th><th scope="col" className="py-3 pr-3 font-medium">Website</th><th scope="col" className="hidden py-3 pr-3 font-medium sm:table-cell">Collection</th><th scope="col" className="py-3 text-right font-medium">Rank</th></tr></thead>
            <tbody>{insights.rankings.map((row) => <tr key={row.id} className="border-b border-border transition-colors hover:bg-bg-main">
              <td className="stat-value py-4 pr-4 align-top text-[13px]"><Link className="text-text-secondary underline decoration-border-light underline-offset-4 transition-colors hover:text-text-primary hover:decoration-brand" href={`/leaderboard?${new URLSearchParams({ kind: row.kind, periodKey: row.periodKey, strategy, scope: row.scope, scopeKey: row.scopeKey })}`}>{row.periodKey}</Link></td>
              <td className="py-4 pr-3 align-top"><Link className="block truncate font-semibold text-text-primary no-underline hover:underline hover:decoration-brand hover:decoration-[3px] hover:underline-offset-4" href={`/site/${row.slug}?strategy=${strategy}`}>{row.name}</Link><span className="mt-0.5 block truncate text-[13px] text-text-muted sm:hidden"><span className="capitalize">{row.scope}</span>{row.scopeKey ? `, ${row.scopeKey}` : ""}</span></td>
              <td className="hidden py-4 pr-3 align-top text-text-secondary sm:table-cell"><span className="capitalize">{row.scope}</span>{row.scopeKey && <span className="ml-2 text-[13px] text-text-muted">{row.scopeKey}</span>}</td>
              <td className="stat-value py-4 text-right align-top text-lg font-medium text-text-primary">#{row.rank}</td>
            </tr>)}</tbody>
          </table> : <p className={quiet}>No finalized rankings for this device under the current competition method yet.</p>}
        </section>
      </div>

      <div className="min-w-0 space-y-14 sm:space-y-16">
        <section aria-labelledby="founder-technologies">
          <h2 id="founder-technologies" className={heading + " mb-6"}>Technologies</h2>
          {insights.technologies.length ? <ul className="flex flex-wrap gap-2">{insights.technologies.map((technology) => <li key={technology.slug}><Link className="chip min-h-9 px-3.5" href={`/technologies/${technology.slug}`}>{technology.name}</Link></li>)}</ul>
            : <p className={quiet}>No technologies have been attributed to these public websites yet.</p>}
        </section>

        <section aria-labelledby="founder-improvements">
          <h2 id="founder-improvements" className={heading}>Recently improved</h2>
          <p className={quiet + " mb-5 mt-3"}>Latest result in the past 30 days compared with the previous complete result for the same device and method.</p>
          {insights.recentlyImproved.length ? <ul className="border-t border-border-light">{insights.recentlyImproved.map((site) => <li key={site.siteId} className="flex items-center justify-between gap-4 border-b border-border py-4">
            <Link className="min-w-0 truncate font-semibold text-text-primary no-underline hover:underline hover:decoration-brand hover:decoration-[3px] hover:underline-offset-4" href={`/site/${site.slug}?strategy=${strategy}`}>{site.name}</Link>
            <span className="stat-value flex flex-none items-center gap-2 text-sm"><span className="text-text-muted">{site.previousScore}</span><ArrowRightIcon size={12} aria-hidden className="text-text-muted" /><span className="sr-only">to</span><span className={"text-lg font-medium " + scoreTone(site.score)}>{site.score}</span><span className="rounded-full bg-green-dim px-2 py-0.5 text-xs text-green">+{site.improvement}<span className="sr-only"> points</span></span></span>
          </li>)}</ul> : <p className={quiet}>No comparable recent score increases for this device yet.</p>}
        </section>

        <section aria-labelledby="founder-awards">
          <h2 id="founder-awards" className={heading + " mb-6"}>Earned badges</h2>
          {insights.awards.length ? <ul className="border-t border-border-light">{insights.awards.map((award) => <li key={award.id} className="border-b border-border py-5"><article className="flex gap-4">
            <span aria-hidden className="monogram"><MedalIcon size={20} /></span>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold tracking-[-.01em]">{award.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">{award.description}</p>
              <Link className="mt-2.5 inline-flex max-w-full items-center gap-1 text-sm font-medium text-text-primary no-underline hover:underline hover:decoration-brand hover:decoration-[3px] hover:underline-offset-4" href={`/site/${award.slug}?strategy=${strategy}`}><span className="truncate">{award.name}</span><ArrowUpRightIcon size={14} aria-hidden className="flex-none" /></Link>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-text-muted"><span><span className="stat-value">{date(award.awardedAt)}</span> UTC, {strategy}</span><a href={`/api/awards/${award.id}/share.png`} className="font-medium text-text-secondary underline decoration-border-light underline-offset-4 transition-colors hover:text-text-primary hover:decoration-brand">Share award</a></div>
            </div>
          </article></li>)}</ul> : <p className={quiet}>No earned badges are recorded for these websites on this device yet.</p>}
        </section>
      </div>
    </div>
  </div>;
}
