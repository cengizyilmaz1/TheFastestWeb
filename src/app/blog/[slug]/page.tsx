import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CaretRight } from "@phosphor-icons/react/dist/ssr";
import { compileMDX } from "next-mdx-remote/rsc";
import { PageHeading, PageShell, SectionHeading } from "@/components/content/PageShell";
import { getAllPosts, getPost, getRelatedPosts } from "@/lib/blog";
import { BLOG_CATEGORIES, headingIds, type TableOfContentsEntry } from "@/lib/blog-content";
import { pageMetadata, publicationDates } from "@/lib/seo/metadata";
import { articleSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const { datePublished, dateModified } = publicationDates(post.date, post.updated);
  return { ...pageMetadata({ title: post.title, description: post.description, path: `/blog/${encodeURIComponent(slug)}`,
    type: "article", publishedTime: datePublished, modifiedTime: dateModified, image: post.coverImage }), authors: [{ name: post.author }] };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const related = getRelatedPosts(slug);
  const tableOfContents: TableOfContentsEntry[] = [];
  const { content } = await compileMDX({ source: post.content, options: { mdxOptions: { rehypePlugins: [headingIds(tableOfContents)] } } });
  const { datePublished: published, dateModified: updated } = publicationDates(post.date, post.updated);
  const formatDate = (date: string) => new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(articleSchema(post)) }} />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-xs text-text-secondary mb-8">
        <Link href="/" className="hover:text-accent">TheFastestWeb</Link><CaretRight size={12} aria-hidden="true" />
        <Link href="/blog" className="hover:text-accent">Blog</Link><CaretRight size={12} aria-hidden="true" />
        <span aria-current="page" className="text-text-primary">{BLOG_CATEGORIES[post.category]}</span>
      </nav>
      <article>
        <PageHeading eyebrow={BLOG_CATEGORIES[post.category]} title={post.title} description={post.description}>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
          <span className="text-sm text-text-secondary">By <span className="text-text-primary">{post.author}</span></span>
          <span className="text-sm text-text-secondary">{post.readingTime} min read</span>
          {/* Native document navigation: this route returns text/markdown, not an App Router page. */}
          <a href={`/markdown/blog/${post.slug}`} className="content-link text-sm">Read as Markdown</a>
          </div>
        </PageHeading>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-secondary -mt-5 mb-7">
          {published && <p>Published <time dateTime={published}>{formatDate(published)}</time></p>}
          {updated && <p>Updated <time dateTime={updated}>{formatDate(updated)}</time></p>}
        </div>
        <div className="relative aspect-[1200/630] overflow-hidden rounded-2xl border border-border mb-10">
          <Image src={post.coverImage} alt={post.coverAlt} fill sizes="(max-width: 1100px) 100vw, calc(100vw - 460px)" className="object-cover" />
        </div>
        <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_210px]">
          <div className="min-w-0 prose prose-invert max-w-none
            prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-tight prose-headings:scroll-mt-24
            prose-h2:text-[1.6rem] prose-h2:mt-10 prose-h2:mb-4
            prose-h3:text-xl prose-h3:mt-7 prose-h3:mb-3
            prose-p:text-text-secondary prose-p:leading-8 prose-p:text-[0.98rem]
            prose-a:text-accent prose-a:decoration-accent/40 hover:prose-a:decoration-accent
            prose-strong:text-text-primary
            prose-code:text-accent-bright prose-code:bg-bg-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-normal
            prose-pre:bg-bg-elevated prose-pre:border prose-pre:border-border prose-pre:rounded-xl prose-pre:max-w-full
            prose-ul:text-text-secondary prose-ol:text-text-secondary prose-li:leading-7 prose-li:text-[0.98rem]
            prose-blockquote:border-accent prose-blockquote:text-text-secondary">
            {content}
          </div>
          {tableOfContents.length > 0 && <aside className="row-start-1 xl:row-auto xl:sticky xl:top-24 rounded-xl bg-bg-card p-5 xl:bg-transparent xl:p-0">
            <nav aria-label="On this page">
              <h2 className="font-display text-base font-semibold mb-4">On this page</h2>
              <ol className="space-y-3 text-sm leading-6">
                {tableOfContents.filter((heading) => heading.depth === 2).map((heading) => <li key={heading.id}><a href={`#${heading.id}`} className="text-text-secondary transition-colors hover:text-accent">{heading.text}</a></li>)}
              </ol>
            </nav>
          </aside>}
        </div>
      </article>

      {related.length > 0 && <section className="content-section mt-14" aria-label="Related guides">
        <SectionHeading title="Keep exploring." description="More practical reading on website performance." />
        <div className="space-y-2">
          {related.map((relatedPost) => <Link key={relatedPost.slug} href={`/blog/${relatedPost.slug}`} className="group grid grid-cols-[1fr_auto] items-center gap-5 border-t border-border py-5 no-underline">
            <div><p className="text-xs text-text-secondary mb-2">{BLOG_CATEGORIES[relatedPost.category]} · {relatedPost.readingTime} min read</p><h3 className="font-display text-xl font-semibold tracking-tight leading-snug group-hover:text-accent transition-colors">{relatedPost.title}</h3></div>
            <ArrowUpRight size={22} className="text-text-secondary group-hover:text-accent transition-colors" aria-hidden="true" />
          </Link>)}
        </div>
      </section>}

      <div className="content-note mt-12 flex flex-wrap items-center justify-between gap-5">
        <div><h2 className="font-display text-2xl font-semibold tracking-tight mb-2">Put the ideas to the test.</h2><p className="text-sm text-text-secondary">Run a website speed test and inspect the results.</p></div>
        <Link href="/test" className="content-action">Test your website <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </PageShell>
  );
}
