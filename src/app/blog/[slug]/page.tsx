import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPost, getRelatedPosts } from "@/lib/blog";

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
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
    twitter: {
      title: post.title,
      description: post.description,
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: {
      "@type": "Person",
      name: "Ramesh Kumar",
      url: "https://x.com/ramesh_mkumar",
    },
    publisher: {
      "@type": "Organization",
      name: "TheFastestWeb",
      url: siteConfig.url,
    },
    url: `${siteConfig.url}/blog/${slug}`,
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
        <div className="flex items-center gap-2 text-[0.75rem] text-text-muted mb-3">
          <span>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          <span>·</span>
          <span>{post.readingTime} min read</span>
        </div>
        <h1 className="page-title mb-5">
          {post.title}
        </h1>
        <p className="text-text-secondary text-[1rem] leading-relaxed">
          {post.description}
        </p>
        <p className="mt-5 text-xs text-text-muted">From the original TheFastestWeb journal · Ramesh Kumar</p>
      </div>

      <hr className="border-border mb-8" />

      {/* MDX Content */}
      <div className="prose prose-sm max-w-none
        prose-headings:font-display prose-headings:font-medium prose-headings:text-text-primary prose-headings:tracking-[-0.02em]
        prose-h2:text-[1.3rem] prose-h2:mt-10 prose-h2:mb-3
        prose-h3:text-[1.1rem] prose-h3:mt-6 prose-h3:mb-2
        prose-p:text-text-secondary prose-p:leading-relaxed prose-p:text-[0.95rem]
        prose-a:text-accent prose-a:no-underline hover:prose-a:underline
        prose-strong:text-text-primary
        prose-code:text-accent-bright prose-code:bg-bg-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:font-normal
        prose-pre:bg-bg-elevated prose-pre:border prose-pre:border-border prose-pre:rounded-[10px]
        prose-ul:text-text-secondary prose-li:text-[0.95rem]
        prose-blockquote:border-accent prose-blockquote:text-text-muted">
        <MDXRemote source={post.content} />
      </div>

      <hr className="border-border mt-12 mb-8" />

      {/* Related Posts */}
      {related.length > 0 && (
        <div className="mb-10">
          <h3 className="font-display font-[800] text-[1rem] tracking-[-0.01em] mb-4 text-text-primary">
            Related Guides
          </h3>
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
