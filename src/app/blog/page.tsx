import { Metadata } from "next";
import Link from "next/link";
import { getPaginatedPosts, POSTS_PER_PAGE, getAllPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog | TheFastestWeb",
  description: "Guides and tips on website speed, Core Web Vitals, and PageSpeed optimization. Learn how the fastest sites on the web stay fast.",
  alternates: { canonical: "https://thefastestweb.site/blog" },
  openGraph: {
    title: "Blog | TheFastestWeb",
    description: "Guides and tips on website speed, Core Web Vitals, and PageSpeed optimization.",
  },
  twitter: {
    title: "Blog | TheFastestWeb",
    description: "Guides and tips on website speed, Core Web Vitals, and PageSpeed optimization.",
  },
};

export default function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // searchParams is a Promise in Next.js 15 App Router
  // but we can access it synchronously via the resolved value in Server Components
  // We'll use React.use() pattern by making this async
  return <BlogPageInner searchParams={searchParams} />;
}

async function BlogPageInner({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page ?? "1", 10);
  const { posts, totalPages, currentPage } = getPaginatedPosts(isNaN(page) ? 1 : page);
  const totalPosts = getAllPosts().length;

  return (
    <div className="py-[40px] px-5 pb-[60px] max-w-[720px] mx-auto">
      <div className="mb-10">
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-[900] tracking-[-0.03em] mb-3">
          Speed{" "}
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            Guides
          </span>
        </h1>
        <p className="text-text-secondary text-[0.95rem]">
          Everything you need to know about website performance, Core Web Vitals, and PageSpeed scores.
          {totalPages > 1 && (
            <span className="text-text-muted ml-1">({totalPosts} articles)</span>
          )}
        </p>
      </div>

      {posts.length === 0 ? (
        <p className="text-text-muted text-[0.9rem]">No posts yet — check back soon.</p>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            {posts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block p-5 rounded-[14px] bg-bg-card border border-border hover:border-border-light hover:bg-bg-card-hover transition-all no-underline group"
              >
                <div className="flex items-center gap-2 text-[0.75rem] text-text-muted mb-2">
                  <span>{new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                  <span>·</span>
                  <span>{post.readingTime} min read</span>
                </div>
                <h2 className="font-display font-[800] text-[1.1rem] tracking-[-0.01em] text-text-primary mb-1 group-hover:text-accent transition-colors">
                  {post.title}
                </h2>
                <p className="text-text-secondary text-[0.88rem] leading-relaxed">
                  {post.description}
                </p>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="relative flex items-center justify-center mt-10 h-10">
              {currentPage > 1 && (
                <Link
                  href={currentPage === 2 ? "/blog" : `/blog?page=${currentPage - 1}`}
                  className="absolute left-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[0.875rem] font-medium bg-bg-card border border-border text-text-secondary no-underline hover:border-border-light hover:text-text-primary transition-all"
                >
                  ← Previous
                </Link>
              )}

              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={p === 1 ? "/blog" : `/blog?page=${p}`}
                    className={`w-9 h-9 flex items-center justify-center rounded-lg text-[0.875rem] font-medium no-underline transition-all ${
                      p === currentPage
                        ? "bg-accent text-bg-deep"
                        : "bg-bg-card border border-border text-text-secondary hover:border-border-light hover:text-text-primary"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </div>

              {currentPage < totalPages && (
                <Link
                  href={`/blog?page=${currentPage + 1}`}
                  className="absolute right-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[0.875rem] font-medium bg-bg-card border border-border text-text-secondary no-underline hover:border-border-light hover:text-text-primary transition-all"
                >
                  Next →
                </Link>
              )}
            </div>
          )}

          {totalPages > 1 && (
            <p className="text-center text-[0.8rem] text-text-muted mt-4">
              Page {currentPage} of {totalPages} &middot; {POSTS_PER_PAGE} posts per page
            </p>
          )}
        </>
      )}
    </div>
  );
}
