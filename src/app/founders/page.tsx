import type { Metadata } from "next";
import Link from "next/link";
import { listFounders } from "@/modules/sites/directory";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
export const metadata: Metadata = { title: "Meet the founders", description: "Meet the people building and improving the websites in TheFastestWeb directory.", alternates: { canonical: "/founders" } };
export default async function FoundersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number((await searchParams).page || 1), page = Number.isInteger(raw) && raw > 0 && raw <= 400 ? raw : 1;
  const result = await listFounders(page).catch(() => null);
  return <div className="page-shell mx-auto max-w-[1120px]"><p className="page-eyebrow mb-4">Behind the build</p><h1 className="page-title">People who care about speed.</h1><p className="page-description mt-4 mb-10">A good website starts with someone who gives it care. Meet the founders who have chosen to share their work.</p>
    {!result ? <EmptyState title="Profiles are temporarily unavailable" description="We could not load founder profiles. Please check back shortly." /> : !result.founders.length ? <EmptyState title="The community starts with you" description="Create a founder profile and choose to make it public. Account information stays private." href="/dashboard" action="Create your profile" /> : <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{result.founders.map((founder) => <Link key={founder.slug} href={`/founders/${founder.slug}`} className="rounded-xl border border-border bg-bg-main p-6 hover:border-border-light"><span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-glow text-xl font-medium text-accent">{founder.name.slice(0, 1)}</span><h2 className="text-lg font-medium">{founder.name}</h2><p className="mt-2 line-clamp-3 text-sm text-text-secondary">{founder.bio || "Building for the web."}</p>{founder.countryCode && <span className="mt-5 block font-mono text-xs text-text-muted">{founder.countryCode}</span>}</Link>)}</div><Pagination page={page} pages={result.pages} href={(next) => `/founders?page=${next}`} /></>}
  </div>;
}
