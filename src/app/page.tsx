import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, CheckCircleIcon, GaugeIcon } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";
import { listDirectory, getDiscovery, listSponsoredPlacements } from "@/modules/sites/directory";
import { SponsoredPlacements } from "@/components/directory/SponsoredPlacements";
import { WebsiteList, EmptyState } from "@/components/directory/WebsiteList";
import { getAllPosts } from "@/lib/blog";

export const metadata: Metadata = { title: "TheFastestWeb — A faster web starts here", description: "Discover the people and websites making the web faster. Explore real performance measurements, transparent rankings and weekly competitions.", alternates: { canonical: "/" } };

export default async function HomePage() {
  const [leaders, recent, discovery, sponsored] = await Promise.allSettled([
    listDirectory({ limit: 5 }), listDirectory({ sort: "newest", limit: 3 }), getDiscovery(), listSponsoredPlacements(1, 6),
  ]);
  const posts = getAllPosts().slice(0, 3);
  return <div className="mx-auto max-w-[1240px]">
    <section className="grid grid-cols-1 items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1fr_1.02fr] lg:gap-14 lg:py-20">
      <div className="min-w-0">
        <p className="page-eyebrow mb-6 flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Built for a faster web</p>
        <h1 className="max-w-[11ch] text-[clamp(3rem,5.8vw,5.6rem)] font-semibold leading-[.98] tracking-[-.055em]">Good websites.<br /><span className="text-accent">Great speed.</span></h1>
        <p className="mt-7 max-w-[39ch] text-lg leading-relaxed text-text-secondary">Meet the makers who care about every millisecond. Discover fast websites, measure yours, and see how you compare.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link href="/submit" className="button-primary">Put your site on the map <ArrowUpRightIcon size={18} aria-hidden /></Link><Link href="/explore" className="button-secondary">Explore websites</Link></div>
        <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-muted"><span className="inline-flex items-center gap-1.5"><CheckCircleIcon size={15} aria-hidden /> Real measurements</span><span className="inline-flex items-center gap-1.5"><CheckCircleIcon size={15} aria-hidden /> Transparent methodology</span></div>
      </div>
      <div className="min-w-0 rounded-[20px] border border-border bg-bg-main px-5 pb-5 pt-6 sm:px-7">
        <div className="flex items-start justify-between gap-3"><div><p className="page-eyebrow mb-2">From the directory</p><h2 className="text-xl font-medium tracking-tight">Speed worth discovering.</h2></div><GaugeIcon size={26} className="text-accent" aria-hidden /></div>
        <p className="mb-2 mt-2 text-xs text-text-muted">Latest recorded mobile lab scores · out of 100</p>
        {leaders.status === "fulfilled" ? <WebsiteList sites={leaders.value.sites} compact /> : <EmptyState title="The directory is taking a moment" description="Website measurements are temporarily unavailable. Please check back shortly." />}
        <Link href="/explore" className="mt-5 flex items-center justify-between text-sm font-medium text-text-secondary hover:text-accent">Explore the directory <ArrowRightIcon size={18} aria-hidden /></Link>
      </div>
    </section>
    <section className="mx-5 flex flex-wrap items-center justify-between gap-5 border-y border-border py-5 sm:mx-8">
      <p className="text-sm text-text-secondary">Small improvements. A better experience for everyone.</p>
      <div className="flex flex-wrap gap-6 text-xs text-text-muted"><span>Mobile & desktop</span><span>PageSpeed Insights</span><Link href="/methodology" className="inline-flex items-center gap-1 hover:text-accent">How we measure <ArrowUpRightIcon size={14} aria-hidden /></Link></div>
    </section>
    <section className="px-5 py-16 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="page-eyebrow mb-3">Find your next favorite</p><h2 className="text-3xl font-medium tracking-tight">Built with purpose.</h2></div><Link href="/explore" className="nav-link">All categories <ArrowRightIcon size={16} className="ml-2" aria-hidden /></Link></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {discovery.status === "fulfilled" && discovery.value.categories.length ? discovery.value.categories.map((category) => <Link key={category.slug} href={"/categories/" + category.slug} className="group flex min-h-28 flex-col justify-between rounded-xl border border-border bg-bg-main p-5 hover:border-border-light"><span className="flex justify-between text-sm font-medium">{category.name}<ArrowUpRightIcon size={16} className="text-text-muted transition-transform group-hover:-translate-y-0.5" aria-hidden /></span><span className="mt-5 font-mono text-xs text-text-muted">{category.count} websites</span></Link>)
          : <div className="col-span-full"><EmptyState title="Every kind of website belongs" description="Browse the directory as websites are added to the available categories." href="/explore" action="Browse websites" /></div>}
      </div>
    </section>
    {sponsored.status === "fulfilled" && sponsored.value.items.length > 0 && <section className="border-t border-border px-5 py-12 sm:px-8"><div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="page-eyebrow mb-3">Sponsored placements</p><h2 className="text-3xl font-medium tracking-tight">Meet our supporters.</h2></div><Link className="nav-link" href="/featured">View all</Link></div><SponsoredPlacements sites={sponsored.value.items} /></section>}
    <section className="border-y border-border bg-bg-main px-5 py-12 sm:px-8">
      <div className="grid gap-8 md:grid-cols-[.8fr_1.2fr] md:items-center">
        <div><p className="page-eyebrow mb-3">The weekly race</p><h2 className="max-w-[17ch] text-3xl font-medium leading-tight tracking-tight">A little competition.<br />A much faster web.</h2><p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-text-secondary">Compare like with like. Mobile and desktop have separate rankings, measured with the same method. Completed competitions keep their results.</p><Link href="/leaderboard" className="button-secondary mt-6">View the rankings <ArrowRightIcon size={16} aria-hidden /></Link></div>
        <div className="grid grid-cols-3 divide-x divide-border py-6"><div className="px-3 text-center"><span className="font-mono text-3xl text-accent">02</span><p className="mt-3 text-xs text-text-secondary">Samples per device</p></div><div className="px-3 text-center"><span className="font-mono text-3xl text-accent">02</span><p className="mt-3 text-xs text-text-secondary">Device strategies</p></div><div className="px-3 text-center"><span className="font-mono text-3xl text-accent">UTC</span><p className="mt-3 text-xs text-text-secondary">One shared calendar</p></div></div>
      </div>
    </section>
    <section className="px-5 py-16 sm:px-8">
      <div className="mb-6 flex items-end justify-between gap-4"><div><p className="page-eyebrow mb-3">Fresh perspectives</p><h2 className="text-3xl font-medium tracking-tight">Just joined the directory.</h2></div><Link href="/explore?sort=newest" className="nav-link">View all <ArrowRightIcon size={16} className="ml-2" aria-hidden /></Link></div>
      {recent.status === "fulfilled" ? <WebsiteList sites={recent.value.sites} /> : <EmptyState title="Recent websites are unavailable" description="We could not load this part of the directory. Try again shortly." />}
    </section>
    {posts.length > 0 && <section className="border-t border-border px-5 py-16 sm:px-8"><div className="mb-8 flex items-end justify-between gap-4"><div><p className="page-eyebrow mb-3">The performance journal</p><h2 className="text-3xl font-medium tracking-tight">A faster web is a learned skill.</h2></div><Link className="nav-link" href="/blog">Read the journal</Link></div><div className="grid gap-8 md:grid-cols-3">{posts.map((post) => <article key={post.slug} className="border-t border-border pt-5"><span className="font-mono text-xs text-text-muted">{post.readingTime} min read</span><h3 className="mt-4 text-xl font-medium leading-snug tracking-tight"><Link className="hover:text-accent" href={"/blog/" + post.slug}>{post.title}</Link></h3><p className="mt-3 line-clamp-3 text-sm leading-relaxed text-text-secondary">{post.description}</p></article>)}</div></section>}
    <section className="mx-5 mb-16 flex flex-col justify-between gap-6 rounded-[20px] border border-border bg-accent-glow p-8 sm:mx-8 sm:flex-row sm:items-center sm:p-10"><div><p className="page-eyebrow mb-3">Made something fast?</p><h2 className="text-3xl font-medium tracking-tight">Give your work a place here.</h2></div><Link href="/submit" className="button-primary shrink-0">Submit your website <ArrowUpRightIcon size={18} aria-hidden /></Link></section>
    <span className="sr-only">{siteConfig.name}</span>
  </div>;
}
