import Link from "next/link";
import type { ReactNode } from "react";
import { siteConfig } from "@/config/site";
import type { PublicPageContent } from "@/content/public-pages";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { webPageSchema } from "@/lib/seo/structured-data";
import { PageHeading, PageShell } from "./PageShell";

function LinkedText({ text }: { text: string }) {
  const pieces = text.split(siteConfig.email);
  return pieces.map((piece, i) => <span key={i}>{i > 0 && <a href={`mailto:${siteConfig.email}`} className="content-link">{siteConfig.email}</a>}{piece}</span>);
}

export function LegalPage({ page, children }: { page: PublicPageContent; children?: ReactNode }) {
  return <PageShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(webPageSchema({ path: page.path, name: page.title, description: page.description, modified: page.updated, trail: [{ name: siteConfig.name, path: "/" }, { name: page.title, path: page.path }] })) }} />
    <PageHeading eyebrow="The details, clearly explained" title={page.title} description={page.description}>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-[0.78rem] text-text-secondary">
        <span>Updated <time dateTime={page.updated}>September 20, 2026</time></span>
        <a href={`/markdown${page.path}`} className="content-link">Read as Markdown</a>
      </div>
    </PageHeading>
    {children && <div className="mb-8">{children}</div>}
    <div className="legal-layout">
      <nav className="legal-nav" aria-label="On this page">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-text-primary">On this page</p>
        <ol>{page.sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}>{String(index + 1).padStart(2, "0")} &nbsp;{section.title}</a></li>)}</ol>
      </nav>
      <article className="content-prose">
        {page.sections.map((section, index) => <section key={section.id} id={section.id} className="legal-section">
          <h2><span className="mr-3 font-mono text-[0.75rem] text-accent">{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>
          {section.paragraphs.map((text, i) => <p key={i}><LinkedText text={text} /></p>)}
          {section.items && <div className="space-y-6">{section.items.map(item => <div key={item.title}><h3>{item.title}</h3>{item.paragraphs.map((text, i) => <p key={i}><LinkedText text={text} /></p>)}</div>)}</div>}
          {section.bullets && <ul>{section.bullets.map((text, i) => <li key={i}><LinkedText text={text} /></li>)}</ul>}
          {section.after?.map((text, i) => <p key={i}><LinkedText text={text} /></p>)}
        </section>)}
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm"><Link href={page.path === "/privacy" ? "/terms" : "/privacy"} className="content-link">{page.path === "/privacy" ? "Terms of service" : "Privacy policy"}</Link><a href={`mailto:${siteConfig.email}`} className="content-link">Contact {siteConfig.ownerName}</a></div>
      </article>
    </div>
  </PageShell>;
}
