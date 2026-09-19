import type { ComponentProps } from "react";
import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeftIcon, ArrowUpRightIcon } from "@phosphor-icons/react/dist/ssr";
import { compileMDX } from "next-mdx-remote/rsc";
import { getAllPosts, getPost, getRelatedPosts } from "@/lib/blog";
import { BLOG_CATEGORIES, headingIds, type TableOfContentsEntry } from "@/lib/blog-content";
import { ShareArticle } from "@/components/blog/ShareArticle";
import { rehypeArticleMarkup } from "@/components/blog/article-markup";

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

/** The shared journal cover is a social card, not an illustration, so only an article's own cover is shown on the page. */
const SHARED_COVER = "/images/journal-cover.png";

/** One grid for the whole article: a narrow rail for facts and contents, a wide column for reading. */
const columns = "grid gap-x-16 lg:grid-cols-[15rem_minmax(0,1fr)] xl:gap-x-24";

/**
 * Typography for compiled MDX. Every color is a token, so the same rules serve both themes and
 * no prose-invert switch is needed. Headings take the expanded display voice; body copy stays at normal width.
 */
const prose = [
  "prose max-w-[68ch] text-[1.0625rem] sm:prose-lg",
  "[--tw-prose-body:var(--ink-secondary)]! [--tw-prose-headings:var(--ink)]! [--tw-prose-lead:var(--ink)]! [--tw-prose-links:var(--ink)]! [--tw-prose-bold:var(--ink)]!",
  "[--tw-prose-counters:var(--ink-muted)]! [--tw-prose-bullets:var(--line-strong)]! [--tw-prose-hr:var(--line)]! [--tw-prose-quotes:var(--ink)]! [--tw-prose-quote-borders:var(--brand-fill)]!",
  "[--tw-prose-captions:var(--ink-muted)]! [--tw-prose-code:var(--ink)]! [--tw-prose-th-borders:var(--line-strong)]! [--tw-prose-td-borders:var(--line)]! [--tw-prose-kbd:var(--ink)]!",
  "prose-p:leading-[1.8] [&>p:first-child]:text-[1.1875rem] sm:[&>p:first-child]:text-[1.3125rem] [&>p:first-child]:leading-[1.65] [&>p:first-child]:text-text-primary",
  "prose-headings:scroll-mt-28 prose-headings:font-semibold prose-headings:tracking-[-.035em] prose-headings:font-stretch-[116%]",
  "prose-h2:mb-5 prose-h2:mt-16 prose-h2:border-t prose-h2:border-border prose-h2:pt-10 prose-h2:text-[clamp(1.6rem,2.6vw,2rem)] prose-h2:leading-[1.12]",
  "prose-h3:mb-3 prose-h3:mt-10 prose-h3:text-[1.3125rem] prose-h3:leading-snug prose-h3:tracking-[-.03em]",
  "prose-a:font-medium prose-a:underline prose-a:decoration-brand prose-a:decoration-2 prose-a:underline-offset-4 prose-a:transition-colors hover:prose-a:decoration-text-primary",
  "prose-code:rounded-md prose-code:bg-bg-card prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[.84em] prose-code:font-medium prose-code:before:content-none prose-code:after:content-none",
  "prose-blockquote:border-l-[3px] prose-blockquote:pl-6 prose-blockquote:text-[1.1875rem] prose-blockquote:font-medium prose-blockquote:not-italic",
  "prose-li:my-1.5 prose-li:marker:font-mono prose-li:marker:text-[.8em] prose-img:rounded-2xl prose-img:border prose-img:border-border prose-hr:my-14",
  // Tables and checklists produced by rehypeArticleMarkup.
  "[&_.article-table]:my-9 [&_.article-table]:overflow-x-auto prose-table:my-0 prose-table:w-full prose-table:text-[15px]",
  "prose-th:border-b prose-th:border-border-light prose-th:px-0 prose-th:pb-3 prose-th:pr-6 prose-th:text-left prose-th:text-[13px] prose-th:font-medium prose-th:text-text-muted",
  "prose-td:border-b prose-td:border-border prose-td:px-0 prose-td:py-3.5 prose-td:pr-6 prose-td:align-baseline prose-td:text-text-secondary [&_td:first-child]:font-semibold [&_td:first-child]:text-text-primary",
  "[&_.article-checklist]:list-none [&_.article-checklist]:pl-0 [&_li[data-task]]:relative [&_li[data-task]]:my-0 [&_li[data-task]]:list-none [&_li[data-task]]:border-b [&_li[data-task]]:border-border [&_li[data-task]]:py-3.5 [&_li[data-task]]:pl-9 [&_li[data-task]]:text-text-primary",
  "[&_li[data-task]]:before:absolute [&_li[data-task]]:before:left-0 [&_li[data-task]]:before:top-[1.15rem] [&_li[data-task]]:before:size-[18px] [&_li[data-task]]:before:rounded-md [&_li[data-task]]:before:border [&_li[data-task]]:before:border-border-light [&_li[data-task]]:before:bg-bg-main [&_li[data-task=done]]:before:border-brand [&_li[data-task=done]]:before:bg-brand",
].join(" ");

/** Code blocks read like the timing board: dark in both themes, scrollable, reachable by keyboard. */
const mdxComponents = {
  pre: (props: ComponentProps<"pre">) => <pre {...props} tabIndex={0} className="not-prose my-8 overflow-x-auto rounded-2xl border border-border bg-bg-main px-5 py-4 font-mono text-[13.5px] leading-[1.7] text-text-primary shadow-panel sm:px-6 sm:py-5" />,
};

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
  const { content } = await compileMDX({ source: post.content, components: mdxComponents, options: { mdxOptions: { rehypePlugins: [headingIds(toc), rehypeArticleMarkup] } } });

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

  const published = new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return (
    <article className="mx-auto max-w-[1240px] px-5 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      <header>
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-x-2 text-sm text-text-muted">
            <li><Link href="/blog" className="group inline-flex min-h-11 items-center gap-2 font-medium text-text-secondary no-underline transition-colors hover:text-text-primary"><ArrowLeftIcon size={16} aria-hidden className="transition-transform group-hover:-translate-x-1" />Journal</Link></li>
            <li aria-hidden className="text-border-light">/</li>
            <li><Link href={"/blog?category=" + post.category} className="inline-flex min-h-11 items-center font-medium text-text-secondary no-underline transition-colors hover:text-text-primary">{BLOG_CATEGORIES[post.category]}</Link></li>
          </ol>
        </nav>

        <h1 className="page-title mt-5 max-w-[20ch] sm:mt-7">{post.title}</h1>

        <div className={columns + " mt-8 gap-y-8 sm:mt-12"}>
          <div className="max-w-[60ch] lg:col-start-2">
            <p className="text-lg leading-relaxed text-text-secondary sm:text-xl">{post.description}</p>
            {post.tags.length > 0 && <ul aria-label="Topics" className="mt-6 flex flex-wrap gap-2">{post.tags.map((tag) => <li key={tag}><Link href={"/blog?tag=" + encodeURIComponent(tag)} className="chip">{tag}</Link></li>)}</ul>}
          </div>
          <dl className="self-end text-sm lg:col-start-1 lg:row-start-1">
            <div className="flex items-baseline justify-between gap-4 border-t border-border py-3"><dt className="text-text-muted">Published</dt><dd className="font-medium text-text-primary"><time dateTime={post.date}>{published}</time></dd></div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border py-3"><dt className="text-text-muted">Reading time</dt><dd className="text-text-primary"><span className="stat-value text-base font-medium">{post.readingTime}</span> min</dd></div>
            <div className="flex items-baseline justify-between gap-4 border-y border-border py-3"><dt className="text-text-muted">Written by</dt><dd className="text-right font-medium text-text-primary">{post.author}</dd></div>
          </dl>
        </div>
        <div aria-hidden className="tick-rule mt-10 sm:mt-14" />
      </header>

      <div className={columns + " mt-10 gap-y-10 sm:mt-16"}>
        <aside className="lg:sticky lg:top-28 lg:max-h-[calc(100dvh-9rem)] lg:self-start lg:overflow-y-auto lg:pb-2 lg:pr-2">
          {toc.length > 0 && <nav aria-label="In this article" className="rounded-2xl bg-bg-card p-5 sm:p-6 lg:rounded-none lg:bg-transparent lg:p-0">
            <h2 className="text-sm font-semibold tracking-normal text-text-primary font-stretch-[100%]">In this article</h2>
            <ol className="mt-4 border-l border-border-light text-sm">{toc.map((entry) => <li key={entry.id} className={entry.depth === 3 ? "hidden lg:block" : undefined}>
              <a href={"#" + entry.id} className={"-ml-px block border-l-2 border-transparent py-1.5 leading-snug no-underline transition-colors hover:border-brand hover:text-text-primary " + (entry.depth === 3 ? "pl-7 text-[13px] text-text-muted" : "pl-4 text-text-secondary")}>{entry.text}</a>
            </li>)}</ol>
          </nav>}
          <div className={toc.length > 0 ? "mt-6 lg:mt-8" : undefined}><ShareArticle title={post.title} url={`${siteConfig.url}/blog/${slug}`} /></div>
        </aside>

        <div className="min-w-0">
          {post.coverImage !== SHARED_COVER && <Image src={post.coverImage} alt={post.coverAlt} width={1200} height={630} sizes="(max-width: 1024px) 100vw, 860px" className="mb-12 h-auto w-full rounded-2xl border border-border" />}
          <div className={prose}>{content}</div>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className={columns + " mt-20 gap-y-6 border-t border-border-light pt-10 sm:mt-28 sm:pt-14"}>
          <h2 id="related-title" className="section-title text-[clamp(1.5rem,2.5vw,2.125rem)]">Keep reading</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug} className="border-b border-border first:border-t">
                <Link href={`/blog/${r.slug}`} className="group flex items-center justify-between gap-6 py-5 text-text-primary no-underline sm:py-6">
                  <span className="min-w-0">
                    <span className="bg-[linear-gradient(var(--brand-fill),var(--brand-fill))] bg-[length:0%_38%] bg-[position:0_88%] bg-no-repeat text-[clamp(1.25rem,2.2vw,1.75rem)] font-semibold leading-[1.2] tracking-[-.04em] transition-[background-size] duration-300 ease-out font-stretch-[112%] group-hover:bg-[length:100%_38%]">{r.title}</span>
                    <span className="mt-2 block text-[13px] text-text-muted">{BLOG_CATEGORIES[r.category]}, <span className="stat-value text-text-secondary">{r.readingTime}</span> min read</span>
                  </span>
                  <ArrowUpRightIcon size={24} aria-hidden className="flex-none text-text-muted transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-text-primary group-active:translate-x-0 group-active:translate-y-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="article-cta" className="surface-brand relative mt-20 overflow-hidden rounded-[28px] px-7 py-12 sm:mt-28 sm:px-12 sm:py-16">
        <h2 id="article-cta" className="max-w-[16ch] text-[clamp(2rem,5vw,4.25rem)] font-bold leading-[.98] tracking-[-.05em] font-stretch-[120%]">How fast is your site?</h2>
        <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-text-secondary">Measure your website with the current lab testing method.</p>
        <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link href="/test" className="button-ink min-h-12 px-6 text-[15px]">Test a site <ArrowUpRightIcon size={18} weight="bold" aria-hidden /></Link>
          <Link href="/methodology" className="inline-flex min-h-11 items-center text-[15px] font-semibold text-text-primary underline decoration-2 underline-offset-4">How we measure</Link>
        </div>
        <div aria-hidden className="tick-rule mt-12 opacity-70" />
      </section>
    </article>
  );
}
