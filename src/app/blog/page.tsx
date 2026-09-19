import type { Metadata } from "next";
import Link from "next/link";
import { getPaginatedPosts, getAllPosts } from "@/lib/blog";
import { EmptyState, Pagination } from "@/components/directory/WebsiteList";
export const metadata: Metadata = { title: "The performance journal", description: "Practical guides to website performance, lab metrics and a faster web.", alternates: { canonical: "/blog" } };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const raw = Number((await searchParams).page || 1);
  const { posts, currentPage, totalPages } = getPaginatedPosts(Number.isInteger(raw) && raw > 0 ? raw : 1);
  return <div className="page-shell mx-auto max-w-[1120px]"><div className="mb-12 border-b border-border pb-10"><p className="page-eyebrow mb-4">The performance journal · {getAllPosts().length} articles</p><h1 className="page-title max-w-[15ch]">A faster web is a learned skill.</h1><p className="page-description mt-5">Understand the measurements, find the bottlenecks, and make your next improvement count.</p></div>
    {posts.length ? <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">{posts.map((post, index) => <article key={post.slug} className="border-t border-border pt-5"><div className="mb-5 flex items-center justify-between font-mono text-xs text-text-muted"><span>{String((currentPage - 1) * 10 + index + 1).padStart(2, "0")}</span><span>{post.readingTime} min read</span></div><h2 className="text-2xl font-medium leading-tight tracking-tight"><Link href={"/blog/" + post.slug} className="hover:text-accent">{post.title}</Link></h2><p className="mt-4 text-sm leading-relaxed text-text-secondary">{post.description}</p><p className="mt-5 text-xs text-text-muted">{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p></article>)}</div> : <EmptyState title="More to read soon" description="New performance guides will appear here." />}
    <Pagination page={currentPage} pages={totalPages} href={(page) => "/blog?page=" + page} />
  </div>;
}
