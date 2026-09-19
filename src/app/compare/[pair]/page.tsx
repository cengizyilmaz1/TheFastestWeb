import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getComparison } from "@/modules/compare/service";
import { parseComparisonPair } from "@/modules/compare/model";
import { HistoryChart } from "@/components/site-detail/HistoryChart";

type Props = { params: Promise<{ pair: string }>; searchParams: Promise<{ strategy?: string; method?: string }> };
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pair } = await params, query = await searchParams;
  const data = await getComparison(pair, query.strategy === "desktop" ? "desktop" : "mobile", query.method);
  if (!data) return { title: "Website comparison", robots: { index: false, follow: false } };
  return { title: `${data.left.site.name} vs ${data.right.site.name} — recorded performance`, description: `Compare ${data.left.site.name} and ${data.right.site.name}: measured lab performance, history, technologies and finalized rankings.`,
    alternates: { canonical: `/compare/${data.canonical}` }, robots: { index: data.indexable && !query.strategy && !query.method, follow: true } };
}
const numeric = (value: number | null | undefined, units = "") => typeof value === "number" && Number.isFinite(value) && value >= 0 ? `${Number(value.toFixed(3))}${units}` : "—";
export default async function ComparisonPage({ params, searchParams }: Props) {
  const { pair } = await params, query = await searchParams, parsed = parseComparisonPair(pair);
  if (!parsed) notFound();
  const strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const data = await getComparison(pair, strategy, query.method);
  if (!data) notFound();
  if (pair !== data.canonical) permanentRedirect(`/compare/${data.canonical}${query.strategy || query.method ? `?${new URLSearchParams({ ...(query.strategy ? { strategy } : {}), ...(query.method ? { method: query.method } : {}) })}` : ""}`);
  const { left, right } = data;
  const metric = (profile: typeof left, key: "score" | "lcpMs" | "cls" | "fcpMs" | "tbtMs" | "siMs", units = "") => data.method && profile.latest?.methodologyVersion === data.method ? numeric(profile.latest[key], units) : "—";
  const rows = [["Performance score", "score", " / 100"], ["Largest contentful paint", "lcpMs", " ms"], ["Cumulative layout shift", "cls", ""], ["First contentful paint", "fcpMs", " ms"], ["Total blocking time", "tbtMs", " ms"], ["Speed index", "siMs", " ms"]] as const;
  return <div className="page-shell mx-auto max-w-[1120px]"><Link className="text-sm text-text-secondary underline" href="/compare">Choose another comparison</Link><p className="page-eyebrow mt-8">Recorded lab performance</p><h1 className="page-title mt-4">{left.site.name} <span className="text-text-muted">vs</span> {right.site.name}</h1><p className="page-description mt-5">Two public websites, one measurement method. These are separately recorded lab tests, not a simultaneous benchmark or real-user Core Web Vitals.</p>
    <div className="my-8 flex flex-wrap items-end justify-between gap-5"><nav aria-label="Comparison device" className="flex gap-3">{(["mobile", "desktop"] as const).map((device) => <Link key={device} href={`/compare/${data.canonical}${device === "desktop" ? "?strategy=desktop" : ""}`} aria-current={device === strategy ? "page" : undefined} className={device === strategy ? "button-primary capitalize" : "button-secondary capitalize"}>{device}</Link>)}</nav>
      {data.methods.length > 0 && <form className="flex items-end gap-3"><input type="hidden" name="strategy" value={strategy} /><label className="text-sm">Shared measurement method<select className="form-field mt-2" name="method" defaultValue={data.method ?? ""}>{!data.method && <option value="">Choose a shared method</option>}{data.methods.map((method) => <option key={method} value={method}>{method}</option>)}</select></label><button className="button-secondary">View</button></form>}
    </div>
    <p className="mb-6 rounded-lg border border-border bg-bg-card p-5 text-sm text-text-secondary">{data.delta === null ? "Comparable measurements are not available for this device and method. No score difference is calculated." : data.delta === 0 ? "The two recorded performance scores are equal for this device and method." : `${data.delta > 0 ? left.site.name : right.site.name} has a recorded score ${Math.abs(data.delta)} points higher for ${strategy}.`}</p>
    <div className="overflow-x-auto rounded-xl border border-border" tabIndex={0} aria-label="Scrollable website metric comparison"><table className="w-full min-w-[520px] text-left text-sm"><caption className="sr-only">{strategy} metrics for {left.site.name} and {right.site.name} using {data.method ?? "no shared method"}</caption><thead className="bg-bg-card"><tr><th scope="col" className="p-4 font-medium">Metric</th>{[left, right].map((profile) => <th scope="col" key={profile.site.id} className="p-4 font-medium"><Link className="underline" href={`/site/${profile.site.slug}?strategy=${strategy}`}>{profile.site.name}</Link></th>)}</tr></thead><tbody>{rows.map(([label, key, units]) => <tr className="border-t border-border" key={key}><th scope="row" className="p-4 font-normal text-text-secondary">{label}</th><td className="p-4 font-mono">{metric(left, key, units)}</td><td className="p-4 font-mono">{metric(right, key, units)}</td></tr>)}</tbody></table></div>
    <p className="mt-4 text-xs text-text-muted">LCP and CLS are lab observations here. Field INP and field Core Web Vitals are unavailable. Missing values are shown as —. <Link href="/methodology" className="underline">Measurement methodology</Link></p>
    <div className="mt-10 grid min-w-0 gap-8 lg:grid-cols-2">{[left, right].map((profile, index) => { const change = index === 0 ? data.leftChange : data.rightChange;
      const matching = Boolean(data.method && profile.latest?.methodologyVersion === data.method), baseline = profile.history[0]?.score ?? 0;
      return <section key={profile.site.id} className="min-w-0"><h2 className="mb-3 text-2xl font-medium">{profile.site.name}</h2><p className="mb-5 text-xs text-text-muted">{matching && profile.latest ? `${profile.latest.testedAt.toISOString().slice(0, 16).replace("T", " ")} UTC · ${profile.latest.sampleCount} samples · ${profile.latest.methodologyVersion}` : "No measurement under a shared method."}</p>
        {matching && profile.latest ? <HistoryChart data={profile.history} currentScore={profile.latest.score} trend={change !== null && baseline > 0 ? Math.round(change / baseline * 100) : 0} /> : <p className="rounded-lg border border-dashed border-border p-6 text-sm text-text-muted">No comparable historical series available.</p>}
        <p className="mb-6 text-sm text-text-secondary">{change === null ? "At least two comparable measurements are needed to describe improvement." : `Change across the displayed history: ${change > 0 ? "+" : ""}${change} score points.`} Up to 365 recorded results for the selected device and method.</p>
        <h3 className="font-semibold">Technologies</h3><div className="mt-3 flex flex-wrap gap-2">{profile.technologies.length ? profile.technologies.map((technology) => <Link className="button-secondary" href={`/technologies/${technology.slug}`} key={technology.slug}>{technology.name}</Link>) : <p className="text-sm text-text-muted">No verified or owner-selected technologies recorded.</p>}</div>
        <h3 className="mt-7 font-semibold">Latest finalized rankings</h3>{data.rankings.some((rank) => rank.site_id === profile.site.id) ? <ul className="mt-3 space-y-2">{data.rankings.filter((rank) => rank.site_id === profile.site.id).map((rank) => <li key={rank.kind} className="text-sm"><Link className="underline" href={`/${rank.kind}/${rank.period_key}?strategy=${strategy}`}>#{rank.rank} · {rank.period_key}</Link><span className="ml-2 text-text-muted">{numeric(rank.score)} points</span></li>)}</ul> : <p className="mt-3 text-sm text-text-muted">No finalized ranking for this device and method.</p>}
      </section>; })}</div>
  </div>;
}
