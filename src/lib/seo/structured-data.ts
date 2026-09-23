import { siteConfig } from "@/config/site";
import { publicationDates, recordedDate, siteUrl, SITE_DESCRIPTION } from "./metadata";

export function identityGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": siteUrl("/#website"), name: siteConfig.name, url: siteUrl(), description: SITE_DESCRIPTION,
        inLanguage: "en", publisher: { "@id": siteUrl("/#organization") }, accountablePerson: { "@id": `${siteConfig.ownerUrl}/#person` } },
      { "@type": "Organization", "@id": siteUrl("/#organization"), name: siteConfig.name, url: siteUrl(),
        logo: { "@type": "ImageObject", url: siteUrl("/favicon/web-app-manifest-512x512.png"), width: 512, height: 512 },
        ...(siteConfig.email ? { email: siteConfig.email, contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: siteConfig.email } } : {}) },
      { "@type": "Person", "@id": `${siteConfig.ownerUrl}/#person`, name: siteConfig.ownerName, url: siteConfig.ownerUrl },
    ],
  };
}

export function breadcrumb(items: { name: string; path: string }[]) {
  return { "@type": "BreadcrumbList", itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: siteUrl(item.path) })) };
}

export function webPageSchema({ path, name, description, type = "WebPage", modified, trail }: {
  path: string; name: string; description: string; type?: "WebPage" | "AboutPage" | "CollectionPage";
  modified?: string | Date | null; trail?: { name: string; path: string }[];
}) {
  const dateModified = recordedDate(modified);
  return { "@context": "https://schema.org", "@type": type, "@id": siteUrl(path) + "#webpage", url: siteUrl(path), name, description, inLanguage: "en",
    isPartOf: { "@id": siteUrl("/#website") }, publisher: { "@id": siteUrl("/#organization") },
    ...(dateModified ? { dateModified } : {}),
    ...(trail ? { breadcrumb: breadcrumb(trail) } : {}),
  };
}

export function articleSchema(post: { slug: string; title: string; description: string; date: string; updated?: string; author: string; coverImage: string }) {
  const path = `/blog/${encodeURIComponent(post.slug)}`;
  const { datePublished, dateModified } = publicationDates(post.date, post.updated);
  return { ...webPageSchema({ path, name: post.title, description: post.description,
    trail: [{ name: siteConfig.name, path: "/" }, { name: "Blog", path: "/blog" }, { name: post.title, path }] }),
    "@type": "BlogPosting", "@id": siteUrl(path) + "#article", headline: post.title,
    mainEntityOfPage: siteUrl(path), image: [siteUrl(post.coverImage)],
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    author: post.author === siteConfig.name ? { "@id": siteUrl("/#organization"), "@type": "Organization", name: post.author }
      : { "@type": "Person", name: post.author, ...(post.author === siteConfig.ownerName ? { url: siteConfig.ownerUrl } : {}) },
  };
}
