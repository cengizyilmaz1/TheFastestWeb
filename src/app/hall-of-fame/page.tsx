import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, DesktopIcon, DeviceMobileIcon } from "@phosphor-icons/react/dist/ssr";
import { listHallOfFame } from "@/modules/rankings/service";
import { monogram } from "@/components/directory/WebsiteList";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";
import { periodLabel, RankingNotice, Segmented, SegmentedLink, snapshotHost, utcDate } from "@/components/rankings/RankingParts";
export const metadata: Metadata = { title: "Hall of fame", description: "Preserved winners of TheFastestWeb weekly and monthly competitions.", alternates: { canonical: "/hall-of-fame" } };
export default async function Page({ searchParams }: { searchParams: Promise<{ strategy?: string; cursor?: string }> }) {
  const query = await searchParams, strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const result = await listHallOfFame({ strategy, cursor: query.cursor }).catch(() => null);
  return <div className="page-shell mx-auto max-w-[1240px]">
    <header>
      <h1 className="page-title">The hall of fame.</h1>
      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <p className="page-description">Winners from completed competitions. Each result preserves the measurement and website information used when the period closed.</p>
        <Segmented label="Device" className="self-start lg:self-auto"><SegmentedLink href="/hall-of-fame" current={strategy === "mobile"}><DeviceMobileIcon size={17} aria-hidden />Mobile</SegmentedLink><SegmentedLink href="/hall-of-fame?strategy=desktop" current={strategy === "desktop"}><DesktopIcon size={17} aria-hidden />Desktop</SegmentedLink></Segmented>
      </div>
    </header>
    <div className="mt-10 sm:mt-14">
      {!result ? <RankingNotice title="The archive is temporarily unavailable" description="Competition records could not be loaded. Please try again shortly, or follow the current competition in the meantime."><Link className="button-secondary" href={`/hall-of-fame${strategy === "desktop" ? "?strategy=desktop" : ""}`}>Try again</Link><Link className="link-underline text-sm" href="/leaderboard">See the current competition</Link></RankingNotice>
        : !result.items.length ? <RankingNotice title="The first chapter is still being written" description="Winners appear here after the first eligible competition closes. Weeks run Monday to Monday and months follow the calendar, both in UTC."><Link className="button-secondary" href="/leaderboard">See the current competition</Link></RankingNotice>
        : <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Winners of completed {strategy} competitions, newest first</caption>
          <colgroup><col className="hidden w-[28%] lg:table-column xl:w-[24%]" /><col /><col className="hidden w-[20%] xl:table-column" /><col className="w-20 sm:w-28" /><col className="w-12 sm:w-40" /></colgroup>
          <thead className="border-b border-border-light text-xs text-text-muted"><tr>
            <th scope="col" className="hidden py-3 pr-4 font-medium lg:table-cell">Competition</th>
            <th scope="col" className="py-3 pr-4 font-medium">Winner</th>
            <th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell"><span className="sr-only">Score scale</span><span aria-hidden className="stat-value flex justify-between"><span>0</span><span>100</span></span></th>
            <th scope="col" className="py-3 text-right font-medium">Score</th>
            <th scope="col" className="py-3 text-right font-medium"><span className="sr-only sm:not-sr-only">Results</span></th>
          </tr></thead>
          <tbody>{result.items.map((item) => {
            const name = String(item.siteSnapshot.name || "Website"), host = snapshotHost(item.siteSnapshot), monthly = item.kind === "monthly";
            const kindTag = <span className={"inline-flex min-h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium " + (monthly ? "bg-brand text-on-brand" : "bg-bg-card text-text-secondary")}>{monthly ? "Monthly" : "Weekly"}</span>;
            const dates = <>{utcDate(item.startAt)} to {utcDate(item.endAt)}</>;
            return <tr key={item.periodKey} className="group border-b border-border transition-colors hover:bg-bg-main">
              <td className="hidden py-6 pr-4 align-top lg:table-cell"><span className="block text-lg font-semibold tracking-[-.02em] text-text-primary font-stretch-[112%]">{periodLabel(item.periodKey)}</span><span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-text-muted">{kindTag}<span>{dates}</span></span></td>
              <td className="py-5 pr-4 lg:py-6">
                <div className="mb-4 lg:hidden"><span className="flex items-center gap-2.5"><span className="font-semibold tracking-[-.02em] text-text-primary">{periodLabel(item.periodKey)}</span>{kindTag}</span><span className="mt-1 block text-[13px] text-text-muted">{dates}</span></div>
                <Link href={`/site/${encodeURIComponent(String(item.siteSnapshot.slug || ""))}`} className="flex min-w-0 items-center gap-3.5 no-underline">
                  <span aria-hidden className="monogram h-11 w-11 transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(name)}</span>
                  <span className="min-w-0"><span className="block truncate text-lg font-semibold tracking-[-.025em] text-text-primary font-stretch-[112%] sm:text-xl">{name}</span>{host && host !== name.toLowerCase() && <span className="mt-0.5 block truncate text-[13px] text-text-muted">{host}</span>}</span>
                </Link>
              </td>
              <td className="hidden px-4 py-6 xl:table-cell"><ScoreTicks score={item.score} /></td>
              <td className={"stat-value py-5 text-right align-bottom text-[2rem] font-medium leading-none sm:text-[2.5rem] lg:py-6 lg:align-middle " + scoreTone(item.score)}>{item.score}</td>
              <td className="py-5 text-right align-bottom lg:py-6 lg:align-middle"><Link href={`/${item.kind}/${item.periodKey}?strategy=${strategy}`} aria-label={`Full results for ${item.periodKey}`} className="group/link inline-flex min-h-11 items-center justify-end gap-1.5 text-sm font-semibold text-text-primary no-underline decoration-brand decoration-2 underline-offset-4 hover:underline"><span className="hidden sm:inline">Full results</span><ArrowRightIcon size={16} aria-hidden className="transition-transform group-hover/link:translate-x-1" /></Link></td>
            </tr>;
          })}</tbody>
        </table>}
    </div>
    {result?.nextCursor && <Link className="button-secondary mt-10" href={`/hall-of-fame?strategy=${strategy}&cursor=${result.nextCursor}`}>Older competitions <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>}
  </div>;
}
