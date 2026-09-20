import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { PageHeading, PageShell } from "@/components/content/PageShell";
import { CategoryBrowser } from "@/components/editorial/CategoryBrowser";
import { categoryPath } from "@/modules/catalog/categories";
import { getCategoryCounts } from "@/modules/catalog/public-categories";
import { pageMetadata, siteUrl } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const dynamic = "force-dynamic";
export const metadata = pageMetadata({ title: "Website categories and PageSpeed performance",
  description: "Explore AI, analytics, design, developer tools, productivity and more. Compare public websites by category and recorded mobile PageSpeed performance.", path: "/categories" });

export default async function CategoriesPage() {
  const catalog = await getCategoryCounts();
  const jsonLd = { ...webPageSchema({ path: "/categories", name: "Website categories", type: "CollectionPage",
    description: "Website categories with individual recorded PageSpeed leaderboards.", trail: [{ name: "TheFastestWeb", path: "/" }, { name: "Categories", path: "/categories" }] }),
    mainEntity: { "@type": "ItemList", numberOfItems: catalog.categories.length, itemListElement: catalog.categories.map((category, index) => ({
      "@type": "ListItem", position: index + 1, name: category.name, url: siteUrl(categoryPath(category.slug)),
    })) } };
  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <PageHeading eyebrow="Website categories" title={<>Discover your corner<br className="hidden sm:block" /> of the web.</>} description="Explore websites by purpose and interest, then compare their recorded mobile PageSpeed results.">
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link href="/" className="content-action-secondary">View the leaderboard <ArrowRight size={18} aria-hidden="true" /></Link>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native navigation to a text/markdown document, not an App Router page. */}
        <a href="/markdown/categories" className="content-link text-sm">Read as Markdown</a>
        </div>
      </PageHeading>
      {!catalog.available && <p role="status" className="content-note text-sm text-text-secondary mb-8">Live website counts are temporarily unavailable. You can still browse every category.</p>}
      <CategoryBrowser categories={catalog.categories} available={catalog.available} />
      <div className="content-note flex flex-wrap items-center justify-between gap-5">
        <div><h2 className="font-display text-2xl font-semibold tracking-tight mb-2">Your next visitor could start here.</h2><p className="text-sm text-text-secondary">Submit your website and choose the category that fits.</p></div>
        <Link href="/submit" className="content-action">Submit your site <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </PageShell>
  );
}
