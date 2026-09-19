import Image from "next/image";
import Link from "next/link";
import { ArrowLeftIcon, ArrowUpRightIcon, DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react/dist/ssr";
import type { getCompetitionOverview } from "@/modules/rankings/overview";
import type { RankingRow } from "@/modules/rankings/service";
import { scoreTone } from "@/components/ui/ScoreTicks";
import { Delta, formatCls, formatLcp, formatTbt, periodLabel, RankingTable, Segmented, SegmentedLink, utcDate } from "./RankingParts";

type Archive = NonNullable<Awaited<ReturnType<typeof getCompetitionOverview>>>;
const siteName=(row:RankingRow)=>String(row.siteSnapshot.name??"Website");
const siteHref=(row:RankingRow)=>`/site/${String(row.siteSnapshot.slug??"")}`;
const collectionTitles={country:"By country",category:"By category",technology:"By technology"} as const;
const textLink="link-underline inline-block text-sm";

export function CompetitionArchive({data}:{data:Archive}) {
  const {period,strategy}=data;
  const rankingHref=(scope="overall",scopeKey="")=>`/leaderboard?${new URLSearchParams({kind:period.kind,periodKey:period.key,strategy,scope,scopeKey})}`;
  return <div className="page-shell mx-auto max-w-[1240px]">
    <Link href="/hall-of-fame" className="group inline-flex min-h-11 items-center gap-2 text-sm font-medium text-text-secondary no-underline transition-colors hover:text-text-primary"><ArrowLeftIcon size={16} aria-hidden className="transition-transform group-hover:-translate-x-1" />Hall of fame</Link>
    <header className="mt-5">
      <p className="page-eyebrow mb-4">Finalized {period.kind} competition</p>
      <h1 className="page-title">{periodLabel(period.key)} results.</h1>
      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <p className="page-description">Recorded from {utcDate(period.startAt)} to {utcDate(period.endAt)} UTC. Positions and measurement evidence are preserved after the competition closes.</p>
        <Segmented label="Archive device" className="self-start lg:self-auto">{(["mobile","desktop"] as const).map(device=><SegmentedLink key={device} href={`?strategy=${device}`} current={strategy===device}>{device==="mobile"?<DeviceMobileIcon size={17} aria-hidden />:<DesktopIcon size={17} aria-hidden />}<span className="capitalize">{device}</span></SegmentedLink>)}</Segmented>
      </div>
    </header>

    <div className="mt-10 grid gap-x-16 gap-y-10 sm:mt-14 lg:grid-cols-[1.35fr_1fr]">
      <section aria-labelledby="archive-winner" className={data.winner?"surface-brand relative flex flex-col overflow-hidden rounded-[28px] px-7 pb-7 pt-8 sm:px-10 sm:pb-9 sm:pt-10":"panel-quiet flex flex-col justify-center rounded-[28px] px-7 py-10 sm:px-10"}>
        {data.winner?<>
          <div className="flex items-center justify-between gap-4 text-sm font-semibold"><span>Overall winner</span><span className="stat-value rounded-full border border-border-light px-3 py-1 text-xs">{period.key}</span></div>
          <h2 id="archive-winner" className="mt-8 text-[clamp(2rem,4.6vw,3.75rem)] font-bold leading-none tracking-[-.05em] font-stretch-[120%] [overflow-wrap:anywhere]"><Link href={siteHref(data.winner)} className="group no-underline decoration-[3px] underline-offset-[6px] hover:underline">{siteName(data.winner)}<ArrowUpRightIcon aria-hidden weight="bold" className="ml-2 inline-block h-[.55em] w-[.55em] align-baseline transition-transform group-hover:-translate-y-1 group-hover:translate-x-1" /></Link></h2>
          <div className="mt-auto flex flex-wrap items-end justify-between gap-x-10 gap-y-6 pt-12">
            <p className="stat-value text-[clamp(4rem,9vw,7rem)] font-medium leading-[.8]">{data.winner.score}<span className="ml-2 font-sans text-base font-semibold tracking-normal">out of 100</span></p>
            <dl className="flex gap-7 text-sm">{[["LCP",formatLcp(data.winner.lcpMs)],["CLS",formatCls(data.winner.cls)],["TBT",formatTbt(data.winner.tbtMs)]].map(([term,value])=><div key={term}><dt className="text-[13px] text-text-secondary">{term}</dt><dd className="stat-value mt-1 text-base font-medium">{value}</dd></div>)}</dl>
          </div>
          <div aria-hidden className="tick-rule mt-8 opacity-70" />
        </>:<>
          <p className="text-sm font-semibold text-text-secondary">Overall winner</p>
          <h2 id="archive-winner" className="mt-4 max-w-[20ch] text-2xl font-semibold leading-[1.1] tracking-[-.035em] font-stretch-[116%] sm:text-[2rem]">No public winner available</h2>
          <p className="mt-4 max-w-[48ch] leading-relaxed text-text-secondary">This period has no published first place for this device. A hidden entry does not promote another website.</p>
        </>}
      </section>
      <div className="self-end">
        <dl className="text-[15px]">{[["Published finalists",data.stats.finalists],["Average finalist score",data.stats.averageScore??"—"],["Country winners",data.stats.countries],["Technology winners",data.stats.technologies]].map(([label,value])=><div key={label} className="flex items-baseline justify-between gap-6 border-t border-border py-4 last:border-b"><dt className="text-text-secondary">{label}</dt><dd className="stat-value text-2xl font-medium text-text-primary">{value}</dd></div>)}</dl>
        <p className="mt-4 text-[13px] leading-relaxed text-text-muted">Statistics describe currently visible entries in the preserved overall top 100 for this device, and visible collection winners.</p>
      </div>
    </div>

    <section className="mt-20 sm:mt-28">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><h2 className="section-title">The top ten.</h2><Link className="link-underline text-sm" href={rankingHref()}>Full top 100</Link></div>
      {data.top.length?<RankingTable rows={data.top} caption={`Finalized ${strategy} overall results for ${period.key}`} />:<p className="border-t border-border pt-5 text-text-secondary">No visible finalists are recorded for this device.</p>}
    </section>

    <div className="mt-20 grid gap-x-16 gap-y-16 sm:mt-28 lg:grid-cols-2">
      <section><h2 className="section-title mb-7">Biggest improvements.</h2><ArchiveEntries rows={data.improved} improvement /><Link className={textLink+" mt-5"} href={rankingHref("improved")}>All improvement results</Link></section>
      <section><h2 className="section-title mb-7">New entries.</h2><ArchiveEntries rows={data.newcomers}/><Link className={textLink+" mt-5"} href={rankingHref("newcomer")}>All newcomer results</Link></section>
    </div>

    <section className="mt-20 sm:mt-28">
      <h2 className="section-title">Collection winners.</h2>
      <p className="mt-4 max-w-[58ch] text-text-secondary">Up to 12 winners per collection type are shown. Individual collection links open their preserved results.</p>
      <div className="mt-9 grid gap-x-12 gap-y-12 lg:grid-cols-3">{(["country","category","technology"] as const).map(scope=>{
        const rows=data.collections.filter(row=>row.scope===scope);
        return <div key={scope} className="min-w-0"><h3 className="text-lg font-semibold tracking-[-.02em]">{collectionTitles[scope]}</h3>
          {rows.length?<ul className="mt-4 border-t border-border">{rows.map(row=><li key={row.id} className="flex items-center gap-3 border-b border-border py-3">
            <Link href={rankingHref(scope,row.scopeKey)} className="chip max-w-[45%] shrink-0"><span className="truncate">{row.scopeKey}</span></Link>
            <Link href={`/site/${row.slug}`} className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary no-underline decoration-brand decoration-2 underline-offset-4 hover:underline">{row.name}</Link>
            <span className={"stat-value text-lg font-medium "+scoreTone(row.score)}><span className="sr-only">First place, score </span>{row.score}</span>
          </li>)}</ul>:<p className="mt-4 border-t border-border pt-4 text-sm text-text-secondary">No public winner for this collection.</p>}
        </div>;})}</div>
    </section>

    <section className="mt-20 sm:mt-28">
      <h2 className="section-title mb-8">Captured during this competition.</h2>
      {data.captures.length?<div className="grid gap-x-6 gap-y-8 sm:grid-cols-3">{data.captures.map(capture=><figure key={capture.id}><a href={capture.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl border border-border bg-bg-card transition-transform duration-200 hover:-translate-y-1"><Image unoptimized loading="lazy" src={capture.url} alt={`${capture.name} ${strategy} screenshot during ${period.key}`} width={capture.width} height={capture.height} className="aspect-[4/3] w-full object-cover object-top"/></a><figcaption className="mt-3 flex items-baseline gap-3 text-sm"><span className="stat-value text-xs text-text-muted">{String(capture.rank).padStart(2,"0")}</span><span className="min-w-0"><span className="block truncate font-semibold text-text-primary">{capture.name}</span><span className="mt-0.5 block text-[13px] text-text-muted">{utcDate(capture.capturedAt)} UTC</span></span></figcaption></figure>)}</div>
        :<p className="max-w-[64ch] border-t border-border pt-5 text-text-secondary">No retained {strategy} captures from this period for the overall top three. Later images are not substituted for historical evidence.</p>}
    </section>

    <section className="mt-20 sm:mt-28">
      <h2 className="section-title mb-8">Achievement share cards.</h2>
      {data.awards.length?<ul className="grid gap-x-16 sm:grid-cols-2">{data.awards.map(award=><li key={award.id} className="flex items-center justify-between gap-5 border-b border-border py-4 first:border-t sm:[&:nth-child(2)]:border-t"><span className="min-w-0"><span className="block truncate font-semibold text-text-primary">{award.title}</span><span className="mt-0.5 block truncate text-sm text-text-secondary">{award.name}</span></span><a className="group inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-text-primary no-underline decoration-brand decoration-2 underline-offset-4 hover:underline" href={`/api/awards/${award.id}/share.png`}>Open share card<ArrowUpRightIcon size={15} aria-hidden className="transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a></li>)}</ul>
        :<p className="max-w-[64ch] border-t border-border pt-5 text-text-secondary">No earned achievement cards have been recorded for this period and device yet.</p>}
    </section>

    <section className="panel-quiet mt-20 grid gap-x-16 gap-y-8 rounded-[28px] p-7 sm:mt-28 sm:p-10 lg:grid-cols-[1.1fr_1fr]">
      <div><h2 className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">How this record is kept.</h2><p className="mt-3 max-w-[52ch] leading-relaxed text-text-secondary">Private or removed listings are hidden at read time; retained positions are never renumbered.</p><Link className={textLink+" mt-4"} href="/methodology">Ranking methodology</Link></div>
      <dl className="self-end text-[15px]">{[["Results",`${strategy==="mobile"?"Mobile":"Desktop"} lab results`],["Measurement method",period.method],["Ranking algorithm",period.algorithm]].map(([term,value])=><div key={term} className="flex items-baseline justify-between gap-6 border-t border-border-light py-3.5 first:border-t-0"><dt className="text-text-secondary">{term}</dt><dd className="text-right font-semibold text-text-primary">{value}</dd></div>)}</dl>
    </section>
  </div>;
}
function ArchiveEntries({rows,improvement=false}:{rows:RankingRow[];improvement?:boolean}){
  return rows.length?<ol className="border-t border-border">{rows.map(row=><li key={row.siteId} className="flex items-center gap-4 border-b border-border py-4">
    <span className="stat-value w-7 shrink-0 text-xs text-text-muted"><span className="sr-only">Rank </span>{String(row.rank).padStart(2,"0")}</span>
    <Link href={siteHref(row)} className="min-w-0 flex-1 truncate font-semibold text-text-primary no-underline decoration-brand decoration-2 underline-offset-4 hover:underline">{siteName(row)}</Link>
    {improvement&&typeof row.evidence.improvement==="number"?<span className="shrink-0 text-lg"><Delta value={row.evidence.improvement} /><span className="ml-1.5 text-[13px] text-text-muted" aria-hidden>points</span></span>:<span className={"stat-value shrink-0 text-lg font-medium "+scoreTone(row.score)}><span className="sr-only">Score </span>{row.score}</span>}
  </li>)}</ol>:<p className="border-t border-border pt-5 text-text-secondary">No eligible published entries for this selection.</p>;
}
