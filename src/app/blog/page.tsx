import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { PageHeading, PageShell } from "@/components/content/PageShell";
import { getPaginatedPosts, POSTS_PER_PAGE, getAllPosts, type PostMeta } from "@/lib/blog";
import { BLOG_CATEGORIES } from "@/lib/blog-content";
import { pageMetadata, recordedDate, siteUrl } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

type Props = { searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = await searchParams;
  const requested = Number.parseInt(query.page ?? "1", 10);
  const { currentPage } = getPaginatedPosts(Number.isNaN(requested) ? 1 : requested);
  return pageMetadata({ title: currentPage === 1 ? "Website speed guides" : `Website speed guides, page ${currentPage}`,
    description: "Practical guides to PageSpeed Insights, website loading performance and Core Web Vitals, with explanations of the metrics behind each score.",
    path: currentPage === 1 ? "/blog" : `/blog?page=${currentPage}`,
    index: Object.keys(query).every((key) => key === "page") && (!query.page || (/^[1-9]\d*$/.test(query.page) && requested === currentPage)) });
}

function PostDetails({ post }: { post: PostMeta }) {
  const published = recordedDate(post.date);
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
    <span className="text-accent">{BLOG_CATEGORIES[post.category]}</span>
    {published && <time dateTime={published}>{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>}
    <span>{post.readingTime} min read</span>
  </div>;
}

export default async function BlogPage({ searchParams }: Props) {
  const params = await searchParams;
  const page = Number.parseInt(params.page ?? "1", 10);
  const { posts, totalPages, currentPage } = getPaginatedPosts(Number.isNaN(page) ? 1 : page);
  const totalPosts = getAllPosts().length;
  const [featured, ...remaining] = posts;
  const path = currentPage === 1 ? "/blog" : `/blog?page=${currentPage}`;
  const jsonLd = { ...webPageSchema({ path, name: "Website speed guides", description: "Guides to website speed, PageSpeed Insights and Core Web Vitals.", type: "CollectionPage",
    trail: [{ name: "TheFastestWeb", path: "/" }, { name: "Blog", path }] }),
    mainEntity: { "@type": "ItemList", numberOfItems: posts.length, itemListElement: posts.map((post, index) => ({ "@type": "ListItem", position: (currentPage - 1) * POSTS_PER_PAGE + index + 1, name: post.title, url: siteUrl(`/blog/${encodeURIComponent(post.slug)}`) })) } };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <PageHeading eyebrow="The performance journal" title={<>Make sense of<br className="hidden sm:block" /> website speed.</>} description="Practical guides to PageSpeed, Core Web Vitals, and the decisions that make websites feel faster.">
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <span className="text-sm text-text-secondary">{totalPosts} {totalPosts === 1 ? "guide" : "guides"}</span>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native navigation to a text/markdown document, not an App Router page. */}
        {currentPage === 1 && Object.keys(params).length === 0 && <a href="/markdown/blog" className="content-link text-sm">Read as Markdown</a>}
        </div>
      </PageHeading>

      {!featured ? <div className="content-note"><h2 className="font-display text-2xl font-semibold mb-2">The first guide is on its way.</h2><p className="text-text-secondary">In the meantime, explore the leaderboard or test your own website.</p><Link href="/test" className="content-link inline-flex items-center gap-2 mt-4">Test a website <ArrowRight size={16} aria-hidden="true" /></Link></div> : (
        <>
          <article className="mb-12">
            <Link href={`/blog/${featured.slug}`} className="group grid overflow-hidden rounded-2xl border border-border bg-bg-card no-underline transition-colors hover:border-accent/60 md:grid-cols-[1fr_1.05fr]">
              <div className="relative aspect-[1.9/1] bg-[#f3f4f2] md:aspect-auto md:min-h-[270px]">
                <Image src={featured.coverImage} alt={featured.coverAlt} fill sizes="(max-width: 767px) 100vw, 45vw" className="object-contain" />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <PostDetails post={featured} />
                <h2 className="font-display text-[clamp(1.6rem,2.6vw,2.15rem)] font-semibold tracking-tight leading-[1.15] mt-5 mb-4 transition-colors group-hover:text-accent">{featured.title}</h2>
                <p className="text-text-secondary text-sm leading-7">{featured.description}</p>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-primary mt-6">Read the guide <ArrowUpRight size={18} aria-hidden="true" /></span>
              </div>
            </Link>
          </article>

          {remaining.length > 0 && <section aria-labelledby="more-guides">
            <h2 id="more-guides" className="font-display text-2xl font-semibold tracking-tight mb-6">More to explore</h2>
            <div className="grid gap-x-9 gap-y-2 md:grid-cols-2">
              {remaining.map((post) => <article key={post.slug} className="border-t border-border py-6">
                <Link href={`/blog/${post.slug}`} className="group block h-full no-underline">
                  <PostDetails post={post} />
                  <h3 className="font-display text-xl font-semibold tracking-tight leading-snug mt-3 mb-3 group-hover:text-accent transition-colors">{post.title}</h3>
                  <p className="text-text-secondary text-sm leading-7">{post.description}</p>
                  <span className="content-link mt-4 inline-flex items-center gap-2 text-sm">Read guide <ArrowRight size={16} aria-hidden="true" /></span>
                </Link>
              </article>)}
            </div>
          </section>}

          {totalPages > 1 && <nav aria-label="Blog pagination" className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-7 mt-8">
            <div className="min-w-0">{currentPage > 1 && <Link rel="prev" href={currentPage === 2 ? "/blog" : `/blog?page=${currentPage - 1}`} className="content-action-secondary"><ArrowLeft size={16} aria-hidden="true" /> Previous</Link>}</div>
            <div className="flex flex-wrap items-center gap-2">
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) => <Link key={number} href={number === 1 ? "/blog" : `/blog?page=${number}`} aria-label={`Page ${number}`} aria-current={number === currentPage ? "page" : undefined} className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium no-underline transition-colors ${number === currentPage ? "bg-accent text-bg-deep" : "border border-border text-text-secondary hover:text-text-primary hover:border-border-light"}`}>{number}</Link>)}
            </div>
            <div className="min-w-0">{currentPage < totalPages && <Link rel="next" href={`/blog?page=${currentPage + 1}`} className="content-action-secondary">Next <ArrowRight size={16} aria-hidden="true" /></Link>}</div>
            <p className="w-full text-center text-xs text-text-secondary">Page {currentPage} of {totalPages}</p>
          </nav>}
        </>
      )}
    </PageShell>
  );
}
