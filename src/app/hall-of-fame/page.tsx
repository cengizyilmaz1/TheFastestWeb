import type { Metadata } from "next";
import Link from "next/link";
import { TrophyIcon } from "@phosphor-icons/react/dist/ssr";
import { listHallOfFame } from "@/modules/rankings/service";
import { EmptyState } from "@/components/directory/WebsiteList";
export const metadata: Metadata = { title: "Hall of fame", description: "Preserved winners of TheFastestWeb weekly and monthly competitions.", alternates: { canonical: "/hall-of-fame" } };
export default async function Page({ searchParams }: { searchParams: Promise<{ strategy?: string; cursor?: string }> }) {
  const query = await searchParams, strategy = query.strategy === "desktop" ? "desktop" : "mobile";
  const result = await listHallOfFame({ strategy, cursor: query.cursor }).catch(() => null);
  return <div className="page-shell mx-auto max-w-[1000px]"><TrophyIcon size={32} className="mb-6 text-accent" aria-hidden /><p className="page-eyebrow mb-4">A place in the record</p><h1 className="page-title">The hall of fame.</h1><p className="page-description mt-4">Winners from completed competitions. Each result preserves the measurement and website information used when the period closed.</p><nav className="my-8 flex gap-3" aria-label="Device"><Link className={strategy === "mobile" ? "button-primary" : "button-secondary"} href="/hall-of-fame">Mobile</Link><Link className={strategy === "desktop" ? "button-primary" : "button-secondary"} href="/hall-of-fame?strategy=desktop">Desktop</Link></nav>
    {!result ? <EmptyState title="The archive is temporarily unavailable" description="Please try again shortly." /> : !result.items.length ? <EmptyState title="The first chapter is still being written" description="Winners appear here after the first eligible competition closes." href="/leaderboard" action="See the current competition" /> : <div className="grid gap-4 sm:grid-cols-2">{result.items.map((item) => <article key={item.periodKey} className="rounded-xl border border-border bg-bg-main p-6"><p className="page-eyebrow">{item.periodKey} · {item.kind}</p><h2 className="mt-4 text-2xl font-medium"><Link href={`/site/${encodeURIComponent(String(item.siteSnapshot.slug || ""))}`} className="hover:text-accent">{String(item.siteSnapshot.name || "Website")}</Link></h2><div className="mt-6 flex items-end justify-between"><span className="font-mono text-4xl text-green">{item.score}<span className="text-sm text-text-muted"> / 100</span></span><Link className="text-sm text-text-secondary underline underline-offset-4" href={`/${item.kind}/${item.periodKey}?strategy=${strategy}`}>Full results</Link></div></article>)}</div>}
    {result?.nextCursor && <Link className="button-secondary mt-8" href={`/hall-of-fame?strategy=${strategy}&cursor=${result.nextCursor}`}>Older competitions</Link>}
  </div>;
}
