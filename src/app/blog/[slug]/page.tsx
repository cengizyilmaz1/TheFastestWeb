import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { compileMDX } from "next-mdx-remote/rsc";
import { getAllPosts, getPost, getRelatedPosts } from "@/lib/blog";
import { BLOG_CATEGORIES, headingIds, type TableOfContentsEntry } from "@/lib/blog-content";
import { ShareArticle } from "@/components/blog/ShareArticle";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `${siteConfig.url}/blog/${slug}` },
    robots: { index: !siteConfig.isDemo, follow: true },
    authors: [{ name: post.author }],
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
      url: `${siteConfig.url}/blog/${slug}`,
      authors: [post.author],
      section: BLOG_CATEGORIES[post.category],
      tags: post.tags,
      images: [{ url: post.coverImage, alt: post.coverAlt }],
    },
    twitter: {
      title: post.title,
      description: post.description,
      card: "summary_large_image",
      images: [post.coverImage],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();
  const related = getRelatedPosts(slug);
  const toc: TableOfContentsEntry[] = [];
  const { content } = await compileMDX({ source: post.content, options: { mdxOptions: { rehypePlugins: [headingIds(toc)] } } });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Person",
      name: post.author,
    },
    publisher: {
      "@type": "Organization",
      name: "TheFastestWeb",
      url: siteConfig.url,
    },
    url: `${siteConfig.url}/blog/${slug}`,
    mainEntityOfPage: `${siteConfig.url}/blog/${slug}`,
    image: `${siteConfig.url}${post.coverImage}`,
    articleSection: BLOG_CATEGORIES[post.category],
    keywords: post.tags.join(", "),
  };

  return (
    <article className="page-shell max-w-[800px] mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[0.8rem] text-text-muted mb-8">
        <Link href="/" className="text-text-muted no-underline hover:text-accent">TheFastestWeb</Link>
        <span className="text-border-light">&rsaquo;</span>
        <Link href="/blog" className="text-text-muted no-underline hover:text-accent">Blog</Link>
        <span className="text-border-light">&rsaquo;</span>
        <span className="text-text-primary truncate">{post.title}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <Link href={"/blog?category=" + post.category} className="page-eyebrow mb-4 inline-block hover:text-accent">{BLOG_CATEGORIES[post.category]}</Link>
        <div className="flex items-center gap-2 text-[0.75rem] text-text-muted mb-3">
          <time dateTime={post.date}>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>
          <span>·</span>
          <span>{post.readingTime} min read</span>
        </div>
        <h1 className="page-title mb-5">
          {post.title}
        </h1>
        <p className="text-text-secondary text-[1rem] leading-relaxed">
          {post.description}
        </p>
        <p className="mt-5 text-xs text-text-muted">By {post.author} · TheFastestWeb journal</p>
        <div className="my-5 flex flex-wrap gap-2">{post.tags.map((tag) => <Link key={tag} href={"/blog?tag=" + encodeURIComponent(tag)} className="rounded border border-border px-2 py-1 text-xs text-text-secondary hover:border-border-light">{tag}</Link>)}</div>
        <ShareArticle title={post.title} url={`${siteConfig.url}/blog/${slug}`} />
      </div>

      <Image src={post.coverImage} alt={post.coverAlt} width={1200} height={630} sizes="(max-width: 800px) 100vw, 736px" className="mb-8 h-auto w-full rounded-lg border border-border" />
      {toc.length > 0 && <nav aria-label="In this article" className="mb-8 rounded-lg border border-border bg-bg-card p-5"><h2 className="mb-3 font-medium">In this article</h2><ol className="space-y-2 text-sm">{toc.map((entry) => <li key={entry.id} className={entry.depth === 3 ? "ml-4" : undefined}><a className="text-text-secondary hover:text-accent" href={"#" + entry.id}>{entry.text}</a></li>)}</ol></nav>}
      <hr className="border-border mb-8" />

      {/* MDX Content */}
      <div className="prose prose-sm max-w-none
        prose-headings:font-display prose-headings:font-medium prose-headings:text-text-primary prose-headings:tracking-[-0.02em] prose-headings:scroll-mt-24
        prose-h2:text-[1.3rem] prose-h2:mt-10 prose-h2:mb-3
        prose-h3:text-[1.1rem] prose-h3:mt-6 prose-h3:mb-2
        prose-p:text-text-secondary prose-p:leading-relaxed prose-p:text-[0.95rem]
        prose-a:text-accent prose-a:no-underline hover:prose-a:underline
        prose-strong:text-text-primary
        prose-code:text-accent-bright prose-code:bg-bg-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-normal
        prose-pre:bg-bg-elevated prose-pre:border prose-pre:border-border prose-pre:rounded-[10px]
        prose-ul:text-text-secondary prose-li:text-[0.95rem]
        prose-blockquote:border-accent prose-blockquote:text-text-muted">
        {content}
      </div>

      <hr className="border-border mt-12 mb-8" />

      {/* Related Posts */}
      {related.length > 0 && (
        <div className="mb-10">
          <h2 className="font-display font-[800] text-[1rem] tracking-[-0.01em] mb-4 text-text-primary">
            Related Guides
          </h2>
          <div className="flex flex-col gap-3">
            {related.map((r) => (
              <Link
                key={r.slug}
                href={`/blog/${r.slug}`}
                className="flex items-start gap-3 p-4 rounded-[12px] bg-bg-card border border-border hover:border-border-light hover:bg-bg-card-hover transition-all no-underline group"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-display font-[700] text-[0.9rem] text-text-primary group-hover:text-accent transition-colors leading-snug">
                    {r.title}
                  </p>
                  <p className="text-text-muted text-[0.78rem] mt-0.5">{r.readingTime} min read</p>
                </div>
                <svg className="shrink-0 mt-0.5 text-text-muted group-hover:text-accent transition-colors" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="rounded-[14px] bg-bg-card border border-border p-6 text-center">
        <p className="font-display font-[800] text-[1.1rem] mb-2">How fast is your site?</p>
        <p className="text-text-secondary text-sm mb-4">Measure your website with the current lab testing method.</p>
        <Link
          href="/test"
          className="button-primary"
        >
          Test Your Site →
        </Link>
      </div>
    </article>
  );
}
