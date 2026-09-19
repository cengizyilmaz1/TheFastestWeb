import type { CSSProperties } from "react";
import Link from "next/link";
import { CaretDownIcon, TrophyIcon, DeviceMobileIcon, DesktopIcon, ArrowRightIcon, ArrowUpRightIcon, ArrowLineUpIcon, LockSimpleIcon } from "@phosphor-icons/react/dist/ssr";
import { listRanking, type RankingQuery } from "@/modules/rankings/service";
import { getDiscovery } from "@/modules/sites/directory";
import { periodLabel, RankingNotice, RankingTable, Segmented, SegmentedLink, utcDate } from "./RankingParts";

const scale = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const scopeNames: Record<NonNullable<RankingQuery["scope"]>, string> = { overall: "Overall", country: "Country", category: "Category", technology: "Technology", improved: "Most improved", newcomer: "Newcomers" };
const tiers = [["perfect", "100", "A perfect recorded score"], ["90-plus", "90+", "90 and beyond"], ["80-plus", "80+", "Built with performance in mind"]];

export async function RankingView({ query = {} }: { query?: RankingQuery }) {
  const [outcome, discovery] = await Promise.allSettled([listRanking(query), getDiscovery()]);
  const data = outcome.status === "fulfilled" ? outcome.value : null;
  const kind = query.kind || "weekly", strategy = query.strategy || "mobile", scope = query.scope || "overall";
  const href = (changes: Partial<RankingQuery>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes })) if (value !== undefined && value !== "" && key !== "limit") params.set(key, String(value));
    return `/leaderboard?${params}`;
  };
  const needsCollection = ["country", "category", "technology"].includes(scope) && !query.scopeKey;
  const closed = data?.status === "closed";
  const leaderScore = data?.items.find((row) => row.rank === 1)?.score;
  const boardTitle = data?.period ? periodLabel(data.period.periodKey) : "All time";
  return <div className="page-shell mx-auto max-w-[1240px]">
    <header>
      <h1 className="page-title">The speed leaderboard.</h1>
      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <p className="page-description">Measured the same way. Ranked on performance. Discover who is making every millisecond count.</p>
        <Link href="/hall-of-fame" className="button-secondary self-start lg:self-auto"><TrophyIcon size={18} aria-hidden />Hall of fame</Link>
      </div>
    </header>

    <div className="mt-10 flex flex-wrap items-end gap-x-8 gap-y-5 border-y border-border py-5 sm:mt-12">
      <div className="min-w-0"><p className="mb-2 text-[13px] font-medium text-text-secondary">Period</p>
        <Segmented label="Competition period">{[["weekly", query.periodKey ? "Weekly" : "This week"], ["monthly", query.periodKey ? "Monthly" : "This month"], ["all_time", "All time"]].map(([value, label]) => <SegmentedLink key={value} href={href({ kind: value as RankingQuery["kind"], periodKey: undefined, cursor: undefined, scope: "overall", scopeKey: "" })} current={kind === value}>{label}</SegmentedLink>)}</Segmented>
      </div>
      <div className="min-w-0"><p className="mb-2 text-[13px] font-medium text-text-secondary">Device</p>
        <Segmented label="Device"><SegmentedLink href={href({ strategy: "mobile", cursor: undefined })} current={strategy === "mobile"}><DeviceMobileIcon size={17} aria-hidden />Mobile</SegmentedLink><SegmentedLink href={href({ strategy: "desktop", cursor: undefined })} current={strategy === "desktop"}><DesktopIcon size={17} aria-hidden />Desktop</SegmentedLink></Segmented>
      </div>
      <form action="/leaderboard" className="grid w-full grid-cols-2 items-end gap-3 sm:flex sm:w-auto sm:flex-wrap xl:ml-auto">
        <input type="hidden" name="kind" value={kind} /><input type="hidden" name="strategy" value={strategy} />{query.periodKey && <input type="hidden" name="periodKey" value={query.periodKey} />}
        <label className="block text-[13px] font-medium text-text-secondary">Ranking<span className="relative mt-2 block"><select name="scope" className="form-field min-h-[50px] cursor-pointer appearance-none truncate rounded-full pl-5 pr-10 sm:w-44" defaultValue={scope}><option value="overall">Overall</option><option value="country">Country</option><option value="category">Category</option><option value="technology">Technology</option>{kind !== "all_time" && <><option value="improved">Most improved</option><option value="newcomer">Newcomers</option></>}</select><CaretDownIcon size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" /></span></label>
        <label className="block text-[13px] font-medium text-text-secondary">Collection<span className="relative mt-2 block"><select className="form-field min-h-[50px] cursor-pointer appearance-none truncate rounded-full pl-5 pr-10 sm:w-52" name="scopeKey" defaultValue={query.scopeKey || ""}><option value="">All websites</option>{discovery.status === "fulfilled" && <><optgroup label="Countries">{discovery.value.countries.map((row) => <option key={row.code} value={row.code}>{row.name}</option>)}</optgroup><optgroup label="Categories">{discovery.value.categories.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}</optgroup><optgroup label="Technologies">{discovery.value.technologies.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}</optgroup></>}</select><CaretDownIcon size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" /></span></label>
        <button className="button-ink col-span-2 min-h-[50px] px-6" type="submit">Apply</button>
      </form>
    </div>

    {data ? <>
      <section aria-labelledby="board-title" className="relative mt-8 overflow-hidden rounded-[28px] border border-border bg-bg-main text-text-primary shadow-pop">
        <div aria-hidden className="dot-grid absolute inset-x-0 top-0 h-[420px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="relative px-5 pb-4 pt-6 sm:px-9 sm:pt-8">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <div>
              <h2 id="board-title" className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">{boardTitle}</h2>
              <p className="mt-1.5 max-w-[64ch] text-sm text-text-muted">{scopeNames[scope]} ranking{data.scopeKey ? ` for ${data.scopeKey}` : ""}, {strategy} lab scores out of 100. {data.period ? <>{utcDate(data.period.startAt)} to {utcDate(data.period.endAt)}, UTC.</> : "Best eligible result for each website."}</p>
            </div>
            <p className="inline-flex min-h-8 items-center gap-2.5 rounded-full border border-border bg-bg-card px-3.5 text-[13px] font-medium text-text-secondary">
              {closed ? <LockSimpleIcon size={14} weight="bold" aria-hidden /> : <span aria-hidden className="animate-pulse-dot h-2 w-2 rounded-full bg-green" />}
              {closed ? "Final, results preserved" : "In progress, results may change"}
            </p>
          </div>
          {data.items.length ? <>
            {leaderScore !== undefined && <div aria-hidden className="mt-8 hidden md:block">
              <div className="relative -mx-3 h-7 overflow-hidden px-3"><div className="needle-track relative h-full" style={{ "--score": leaderScore } as CSSProperties}><span className="absolute -right-px top-0 h-full w-[3px] origin-bottom -skew-x-[18deg] rounded-sm bg-brand shadow-[0_0_14px_var(--brand-fill)]" /></div></div>
              <div className="tick-rule" />
              <div className="stat-value mt-2 flex justify-between text-[11px] text-text-muted">{scale.map((mark) => <span key={mark} className="w-0 whitespace-nowrap first:w-auto last:w-auto [&:not(:first-child):not(:last-child)]:-translate-x-1/2">{mark}</span>)}</div>
            </div>}
            <div className="mt-8"><RankingTable rows={data.items} leader="row" settle emphasis={scope === "improved" ? "change" : "score"} caption={`Standardized ${strategy} performance ranking`} /></div>
          </> : <div className="grid gap-10 pb-6 pt-10 sm:pb-10 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:gap-16">
            <div>
              <h3 className="max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.75rem)] font-semibold leading-[1.05] tracking-[-.04em] font-stretch-[116%]">The starting line is open.</h3>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-text-secondary">No eligible measurements are available for this selection yet. Rankings use two lab samples per device under the current method; historical scores remain in the directory.</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/explore" className="button-primary">Explore historical measurements</Link><Link href="/submit" className="link-underline text-sm">Submit website</Link></div>
            </div>
            <ol aria-hidden className="hidden lg:block">{["01", "02", "03"].map((slot) => <li key={slot} className="flex items-center gap-4 border-t border-border py-4 last:border-b"><span className="stat-value w-8 text-xs text-text-muted">{slot}</span><span className="h-10 w-10 rounded-xl border border-dashed border-border-light" /><span className="h-2.5 flex-1 rounded-full bg-bg-card" /><span className="stat-value text-2xl text-text-muted">—</span></li>)}</ol>
          </div>}
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-t border-border px-5 py-4 text-[13px] text-text-muted sm:px-9">
          {data.nextCursor || query.cursor ? <div className="flex flex-wrap items-center gap-3">
            {data.nextCursor && <Link className="button-secondary" href={href({ cursor: data.nextCursor })}>Next results <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>}
            {query.cursor && <Link className="inline-flex min-h-11 items-center gap-1.5 px-2 font-medium text-text-secondary no-underline transition-colors hover:text-text-primary" href={href({ cursor: undefined })}><ArrowLineUpIcon size={15} aria-hidden />Back to first place</Link>}
          </div> : <span>Mobile and desktop are ranked separately with the same method.</span>}
          <Link href="/methodology" className="inline-flex min-h-8 items-center gap-1.5 font-medium text-text-secondary no-underline transition-colors hover:text-text-primary">How we measure <ArrowUpRightIcon size={14} aria-hidden /></Link>
        </div>
      </section>

      <dl className="mt-8 grid gap-x-10 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[["Measurement method", data.performanceMethodVersion], ["Ranking algorithm", data.rankingAlgorithmVersion], ["Samples", "Two per measurement"], ["Tie-breakers", "LCP, CLS, TBT, then a stable website ID"]].map(([term, value]) => <div key={term} className="border-t border-border py-4"><dt className="text-[13px] text-text-muted">{term}</dt><dd className="mt-1 font-semibold text-text-primary">{value}</dd></div>)}
      </dl>
      <p className="mt-4 text-sm"><Link href="/methodology" className="link-underline">Read the methodology</Link></p>
    </> : <div className="mt-8"><RankingNotice title={needsCollection ? "Choose a collection for this ranking" : "This ranking could not be loaded"} description={needsCollection ? `${scopeNames[scope]} rankings compare websites inside one collection. Pick one in the Collection field above and apply again.` : "Check your selected collection and try again. Rankings also need an available measurement database."}><Link href="/leaderboard" className="button-secondary">Reset filters</Link></RankingNotice></div>}

    <section className="mt-20 sm:mt-28">
      <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[1fr_1.35fr]">
        <div><h2 className="section-title max-w-[14ch]">Recorded score tiers.</h2><p className="mt-5 max-w-[44ch] leading-relaxed text-text-secondary">Websites grouped by their latest recorded mobile score. These lists are historical and separate from the competitions above.</p></div>
        <ul>{tiers.map(([slug, mark, title]) => <li key={slug}><Link href={"/leaderboard/" + slug} className="group flex items-center gap-5 border-t border-border py-5 no-underline transition-colors hover:border-text-primary sm:gap-8 sm:py-6">
          <span className="stat-value w-[3.2ch] text-[clamp(2rem,4.4vw,3.5rem)] font-medium leading-none text-text-primary">{mark}</span>
          <span className="min-w-0 flex-1 text-lg font-semibold tracking-[-.025em] text-text-primary font-stretch-[112%] sm:text-xl"><span className="bg-[linear-gradient(var(--brand-fill),var(--brand-fill))] bg-[length:0%_38%] bg-[position:0_88%] bg-no-repeat transition-[background-size] duration-300 ease-out group-hover:bg-[length:100%_38%]">{title}</span></span>
          <ArrowRightIcon size={20} aria-hidden className="shrink-0 text-text-muted transition-transform duration-200 group-hover:translate-x-1 group-hover:text-text-primary" />
        </Link></li>)}</ul>
      </div>
    </section>
  </div>;
}
