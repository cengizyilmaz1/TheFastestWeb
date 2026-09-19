import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { listDirectory } from "@/modules/sites/directory";
import { comparisonPair } from "@/modules/compare/model";
import { monogram } from "@/components/directory/WebsiteList";
import { scoreTone } from "@/components/ui/ScoreTicks";

export const metadata: Metadata = { title: "Compare website performance", description: "Compare recorded lab performance, measurement history and technologies for two public websites.", alternates: { canonical: "/compare" }, robots: { index: false, follow: true } };
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ left?: string; right?: string }> }) {
  const query = await searchParams, pair = comparisonPair(query.left ?? "", query.right ?? "");
  if (pair) redirect(`/compare/${pair}`);
  const examples = await listDirectory({ limit: 48, sort: "score" });
  const first = query.left && query.left.length <= 200 && slugPattern.test(query.left) ? query.left : null;
  const firstName = first ? examples.sites.find((site) => site.slug === first)?.name ?? first : null;
  const starters = examples.sites.slice(0, 8);
  return <div className="page-shell mx-auto max-w-[1240px]">
    <h1 className="page-title max-w-[16ch]">Compare two websites.</h1>
    <p className="page-description mt-6">Put two websites side by side. Compare performance scores, loading metrics and measurement history under the same lab testing method.</p>

    <form className="panel relative mt-10 overflow-hidden p-5 sm:mt-12 sm:p-9" action="/compare">
      <div aria-hidden className="dot-grid absolute inset-x-0 top-0 h-40 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative grid items-end gap-x-6 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <label className="block"><span className="text-sm font-semibold text-text-primary">First website slug</span><input className="form-field mt-2 min-h-14 px-4 text-base" name="left" list="comparison-websites" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} defaultValue={query.left ?? ""} placeholder="website-slug" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
        <span aria-hidden className="hidden pb-3.5 text-2xl font-semibold tracking-[-.04em] text-text-muted font-stretch-[120%] md:block">vs</span>
        <label className="block"><span className="text-sm font-semibold text-text-primary">Second website slug</span><input className="form-field mt-2 min-h-14 px-4 text-base" name="right" list="comparison-websites" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} defaultValue={query.right ?? ""} placeholder="another-website" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
      </div>
      <datalist id="comparison-websites">{examples.sites.map((site) => <option key={site.id} value={site.slug}>{site.name}</option>)}</datalist>
      {query.left && query.right && !pair && <p className="relative mt-5 flex items-start gap-2.5 rounded-xl bg-red-dim px-4 py-3 text-sm font-medium text-red" role="alert"><WarningCircleIcon size={18} weight="bold" className="mt-0.5 shrink-0" aria-hidden /><span>Choose two different valid website slugs. A slug uses lowercase letters, numbers and hyphens, as in the report address.</span></p>}
      <div className="relative mt-7 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button className="button-primary min-h-12 px-6 text-[15px]! font-semibold!" type="submit">Compare websites <ArrowRightIcon size={18} weight="bold" aria-hidden /></button>
        <p className="max-w-[60ch] text-[13px] leading-relaxed text-text-muted">Choose a suggestion, or enter the last part of a website’s report address: the name after <span className="font-medium text-text-secondary">/site/</span>.</p>
      </div>
    </form>

    {starters.length > 0 && <section className="mt-20 grid gap-x-16 gap-y-8 sm:mt-28 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
      <div className="min-w-0"><h2 className="section-title max-w-[14ch]">{first ? "Now pick the second." : "Or start from the top."}</h2><p className="mt-5 max-w-[44ch] leading-relaxed text-text-secondary">{first ? <>The first field holds <span className="font-semibold text-text-primary">{firstName}</span>. Choose another website to open the comparison.</> : "The highest latest mobile scores in the directory. Choose one to fill the first field, then a second to open the comparison."}</p>{first && <Link href="/compare" className="link-underline mt-6 inline-block text-sm">Clear the first website</Link>}</div>
      <ul className="min-w-0 border-t border-border">{starters.map((site) => {
        const chosen = site.slug === first, measured = Boolean(site.lastTestedAt);
        const row = <><span aria-hidden className={"monogram transition-colors " + (chosen ? "bg-brand text-on-brand" : "group-hover:bg-brand group-hover:text-on-brand")}>{monogram(site.name)}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold text-text-primary">{site.name}</span><span className="mt-0.5 block truncate text-[13px] text-text-muted">{site.slug}</span></span>{chosen && <span className="chip chip-active min-h-7 text-xs">First website</span>}<span className={"stat-value w-12 text-right text-lg font-medium " + scoreTone(site.currentScore, measured)}><span className="sr-only">Score </span>{measured ? site.currentScore : "—"}</span></>;
        return <li key={site.id} className="border-b border-border">{chosen ? <div className="flex min-h-[68px] items-center gap-3.5 py-3">{row}</div>
          : <Link href={first ? `/compare?${new URLSearchParams({ left: first, right: site.slug })}` : `/compare?left=${site.slug}`} className="group flex min-h-[68px] items-center gap-3.5 py-3 no-underline transition-colors hover:bg-bg-main">{row}</Link>}</li>;
      })}</ul>
    </section>}
  </div>;
}
