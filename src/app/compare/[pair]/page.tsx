import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon, CaretDownIcon } from "@phosphor-icons/react/dist/ssr";
import { getComparison } from "@/modules/compare/service";
import { parseComparisonPair } from "@/modules/compare/model";
import { HistoryChart } from "@/components/site-detail/HistoryChart";
import { ScoreReadout } from "@/components/site-detail/ScoreReadout";
import { BAND_TONE, metricBand, scoreBand, type MetricKey } from "@/components/site-detail/metric-bands";
import { monogram } from "@/components/directory/WebsiteList";

type Props = { params: Promise<{ pair: string }>; searchParams: Promise<{ strategy?: string; method?: string }> };
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pair } = await params, query = await searchParams;
  const data = await getComparison(pair, query.strategy === "desktop" ? "desktop" : "mobile", query.method);
  if (!data) return { title: "Website comparison", robots: { index: false, follow: false } };
  return { title: `${data.left.site.name} vs ${data.right.site.name} — recorded performance`, description: `Compare ${data.left.site.name} and ${data.right.site.name}: measured lab performance, history, technologies and finalized rankings.`,
    alternates: { canonical: `/compare/${data.canonical}` }, robots: { index: data.indexable && !query.strategy && !query.method, follow: true } };
}
const numeric = (value: number | null | undefined, units = "") => typeof value === "number" && Number.isFinite(value) && value >= 0 ? `${Number(value.toFixed(3))}${units}` : "—";
const sentence = (value: string) => { const text = value.replaceAll("_", " "); return text.charAt(0).toUpperCase() + text.slice(1); };
/** The needle mark: the only sign of which value leads a row. No wording is attached to it. */
function Lead() { return <span aria-hidden className="mr-2.5 inline-block h-3.5 w-[3px] -skew-x-[20deg] rounded-[1px] bg-brand shadow-[5px_0_0_color-mix(in_srgb,var(--brand-fill)_45%,transparent)]" />; }

export default async function ComparisonPage({ params, searchParams }: Props) {
  const { pair } = await params, query = await searchParams, parsed = parseComparisonPair(pair);
  if (!parsed) notFound();
  const strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const data = await getComparison(pair, strategy, query.method);
  if (!data) notFound();
  if (pair !== data.canonical) permanentRedirect(`/compare/${data.canonical}${query.strategy || query.method ? `?${new URLSearchParams({ ...(query.strategy ? { strategy } : {}), ...(query.method ? { method: query.method } : {}) })}` : ""}`);
  const { left, right } = data;
  type Key = "score" | "lcpMs" | "cls" | "fcpMs" | "tbtMs" | "siMs";
  const reading = (profile: typeof left, key: Key) => { const value = data.method && profile.latest?.methodologyVersion === data.method ? profile.latest[key] : null; return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; };
  const rows = [["Performance score", "score", "/100"], ["Largest contentful paint", "lcpMs", "ms"], ["Cumulative layout shift", "cls", ""], ["First contentful paint", "fcpMs", "ms"], ["Total blocking time", "tbtMs", "ms"], ["Speed index", "siMs", "ms"]] as const;
  // Index of the profile that leads a metric: the higher score, or the lower time or shift. Ties and missing values lead nowhere.
  const leader = (key: Key) => { const a = reading(left, key), b = reading(right, key); if (a === null || b === null || a === b) return -1; return (key === "score" ? a > b : a < b) ? 0 : 1; };
  const tone = (key: Key, value: number) => BAND_TONE[(key === "score" ? scoreBand(value) : metricBand(key as MetricKey, value)) ?? "good"];
  const scoreLeader = leader("score");
  return <div className="page-shell mx-auto max-w-[1240px]">
    <Link className="group inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-text-secondary no-underline transition-colors hover:text-text-primary" href="/compare"><ArrowLeftIcon size={16} className="transition-transform group-hover:-translate-x-1" aria-hidden />Choose another comparison</Link>
    <h1 className="page-title mt-7 break-words">{left.site.name} <span className="font-normal text-text-muted">vs</span> {right.site.name}</h1>
    <div className="mt-7 flex flex-col justify-between gap-x-12 gap-y-8 lg:flex-row lg:items-end">
      <p className="page-description">Two public websites, one measurement method. These are separately recorded lab tests, not a simultaneous benchmark or real-user Core Web Vitals.</p>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4"><nav aria-label="Comparison device" className="flex min-h-[46px] items-center gap-1.5">{(["mobile", "desktop"] as const).map((device) => <Link key={device} href={`/compare/${data.canonical}${device === "desktop" ? "?strategy=desktop" : ""}`} aria-current={device === strategy ? "page" : undefined} className="chip min-h-10 px-4 text-sm capitalize">{device}</Link>)}</nav>
        {data.methods.length > 0 && <form className="flex items-end gap-2"><input type="hidden" name="strategy" value={strategy} /><label className="text-[13px] font-medium text-text-secondary">Shared measurement method<span className="relative mt-1.5 block"><select className="form-field min-w-[200px] cursor-pointer appearance-none truncate rounded-full pl-5 pr-10" name="method" defaultValue={data.method ?? ""}>{!data.method && <option value="">Choose a shared method</option>}{data.methods.map((method) => <option key={method} value={method}>{method}</option>)}</select><CaretDownIcon size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary" /></span></label><button className="button-secondary min-h-[46px] text-sm! font-semibold!">View</button></form>}
      </div>
    </div>

    <section aria-label="Performance scores" className="panel relative mt-10 overflow-hidden sm:mt-12">
      <div aria-hidden className="dot-grid absolute inset-x-0 top-0 h-52 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative grid md:grid-cols-2">{[left, right].map((profile, index) => { const score = reading(profile, "score");
        return <div key={profile.site.id} className={"min-w-0 px-5 pb-8 pt-6 sm:px-8 sm:pt-7 " + (index ? "border-t border-border md:border-l md:border-t-0" : "")}>
          <Link href={`/site/${profile.site.slug}?strategy=${strategy}`} className="group flex min-w-0 items-center gap-3.5 no-underline"><span aria-hidden className="monogram h-11 w-11 transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(profile.site.name)}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-[17px] font-semibold tracking-[-.02em] text-text-primary"><span className="truncate">{profile.site.name}</span><ArrowUpRightIcon size={16} className="shrink-0 text-text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary" aria-hidden /></span><span className="mt-0.5 block truncate text-[13px] text-text-muted">{score !== null && profile.latest ? <>Measured <span className="stat-value">{profile.latest.testedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span></> : "No measurement under a shared method"}</span></span></Link>
          <div className="mt-9"><ScoreReadout compact score={score} quiet={scoreLeader !== -1 && scoreLeader !== index} /></div>
        </div>; })}</div>
      <p className="relative border-t border-border bg-bg-card/50 px-5 py-5 text-[15px] leading-relaxed text-text-secondary sm:px-8">{data.delta === null ? "Comparable measurements are not available for this device and method. No score difference is calculated." : data.delta === 0 ? "The two recorded performance scores are equal for this device and method." : `${data.delta > 0 ? left.site.name : right.site.name} has a recorded score ${Math.abs(data.delta)} points higher for ${strategy}.`}</p>
    </section>

    <section className="mt-20 sm:mt-28">
      <h2 className="section-title">Metric by metric</h2>
      <p className="mb-8 mt-3 max-w-[72ch] text-[15px] leading-relaxed text-text-secondary">The needle mark and the band color show the higher score, or the lower time or shift, in each row. Equal and missing values are left unmarked.</p>
      <table className="w-full table-fixed border-collapse text-left text-sm"><caption className="sr-only">{strategy} metrics for {left.site.name} and {right.site.name} using {data.method ?? "no shared method"}</caption>
        <colgroup><col /><col className="w-[29%] md:w-[24%] lg:w-[20%]" /><col className="w-[29%] md:w-[24%] lg:w-[20%]" /></colgroup>
        <thead className="border-b border-border-light text-xs text-text-muted"><tr><th scope="col" className="py-3 pr-3 align-bottom font-medium">Metric</th>{[left, right].map((profile) => <th scope="col" key={profile.site.id} className="py-3 pl-3 text-right align-bottom"><Link className="break-words text-sm font-semibold text-text-primary underline decoration-brand decoration-2 underline-offset-4 hover:decoration-text-primary" href={`/site/${profile.site.slug}?strategy=${strategy}`}>{profile.site.name}</Link></th>)}</tr></thead>
        <tbody>{rows.map(([label, key, units]) => { const lead = leader(key);
          return <tr className="border-b border-border transition-colors hover:bg-bg-main" key={key}><th scope="row" className="py-5 pr-3 text-[15px] font-semibold leading-snug text-text-primary">{label}</th>{[left, right].map((profile, index) => { const value = reading(profile, key);
            return <td key={profile.site.id} className={"stat-value whitespace-nowrap py-5 pl-3 text-right text-lg sm:text-2xl " + (value === null ? "text-text-muted" : lead === index ? "font-semibold " + tone(key, value) : lead === -1 ? "text-text-primary" : "text-text-secondary")}>{lead === index && <Lead />}{numeric(value)}{value !== null && units && <span className="ml-1 text-xs font-normal text-text-muted sm:text-sm">{units}</span>}{lead === index && <span className="sr-only"> ({key === "score" ? "higher" : "lower"})</span>}</td>; })}</tr>; })}</tbody>
      </table>
      <p className="mt-5 max-w-[80ch] text-[13px] leading-relaxed text-text-muted">LCP and CLS are lab observations here. Field INP and field Core Web Vitals are unavailable. Missing values are shown as —. <Link href="/methodology" className="link-underline">Measurement methodology</Link></p>
    </section>

    <div className="mt-20 grid min-w-0 gap-x-12 gap-y-20 sm:mt-28 lg:grid-cols-2 xl:gap-x-16">{[left, right].map((profile, index) => { const change = index === 0 ? data.leftChange : data.rightChange;
      const matching = Boolean(data.method && profile.latest?.methodologyVersion === data.method), baseline = profile.history[0]?.score ?? 0;
      const ranks = data.rankings.filter((rank) => rank.site_id === profile.site.id);
      return <section key={profile.site.id} className="min-w-0"><h2 className="break-words text-[clamp(1.5rem,2.4vw,2rem)] font-semibold leading-[1.1] tracking-[-.04em] font-stretch-[116%]">{profile.site.name}</h2>
        {matching && profile.latest ? <p className="mb-6 mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[13px] text-text-muted"><span className="stat-value text-text-secondary">{profile.latest.testedAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span><span><span className="stat-value text-text-secondary">{profile.latest.sampleCount}</span> sample{profile.latest.sampleCount === 1 ? "" : "s"}</span><span>{profile.latest.methodologyVersion}</span></p> : <p className="mb-6 mt-3 text-[13px] text-text-muted">No measurement under a shared method.</p>}
        {matching && profile.latest ? <HistoryChart data={profile.history} currentScore={profile.latest.score} trend={change !== null && baseline > 0 ? Math.round(change / baseline * 100) : 0} /> : <p className="dot-grid rounded-2xl border border-dashed border-border-light px-6 py-10 text-sm leading-relaxed text-text-secondary">No comparable historical series available. Choose another shared method or device above.</p>}
        <p className="mt-5 text-sm leading-relaxed text-text-secondary">{change === null ? "At least two comparable measurements are needed to describe improvement." : `Change across the displayed history: ${change > 0 ? "+" : ""}${change} score points.`} Up to 365 recorded results for the selected device and method.</p>
        <dl className="mt-9 border-t border-border">
          <div className="border-b border-border py-6"><dt className="text-[15px] font-semibold text-text-primary">Technologies</dt><dd className="mt-3.5">{profile.technologies.length ? <ul className="flex flex-wrap gap-2">{profile.technologies.map((technology) => <li key={technology.slug}><Link className="chip" href={`/technologies/${technology.slug}`}>{technology.name}</Link></li>)}</ul> : <p className="text-sm text-text-secondary">No verified or owner-selected technologies recorded.</p>}</dd></div>
          <div className="border-b border-border py-6"><dt className="text-[15px] font-semibold text-text-primary">Latest finalized rankings</dt><dd className="mt-2">{ranks.length ? <ul>{ranks.map((rank) => <li key={rank.kind} className="border-t border-border first:border-t-0"><Link className="group flex min-h-12 items-baseline gap-4 py-3 no-underline" href={`/${rank.kind}/${rank.period_key}?strategy=${strategy}`}><span className="stat-value w-14 text-xl font-medium text-text-primary"><span className="text-sm font-normal text-text-muted">#</span>{rank.rank}</span><span className="min-w-0 flex-1 text-sm font-semibold text-text-primary group-hover:underline group-hover:decoration-brand group-hover:decoration-2 group-hover:underline-offset-4">{sentence(rank.kind)} <span className="stat-value ml-1.5 text-xs font-normal text-text-muted">{rank.period_key}</span></span><span className="text-[13px] text-text-muted"><span className="stat-value text-text-secondary">{numeric(rank.score)}</span> points</span></Link></li>)}</ul> : <p className="mt-1.5 text-sm text-text-secondary">No finalized ranking for this device and method.</p>}</dd></div>
        </dl>
      </section>; })}</div>
  </div>;
}
