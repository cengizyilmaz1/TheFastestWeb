import Link from "next/link";
import { PageHeading, PageShell, SectionHeading } from "@/components/content/PageShell";
import { MarkdownLink } from "@/components/content/MarkdownLink";
import { AdvertisePurchase } from "@/components/ads/AdvertisePurchase";
import { publicPages } from "@/content/public-pages";
import { siteConfig } from "@/config/site";
import { pageMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

const page = publicPages.advertise;
export const metadata = pageMetadata({ title: "Advertise on TheFastestWeb", description: page.description, path: page.path });

export default function AdvertisePage() {
  return <PageShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(webPageSchema({ path: page.path, name: "Advertise on TheFastestWeb", description: page.description, trail: [{ name: siteConfig.name, path: "/" }, { name: "Advertise", path: page.path }] })) }} />
    <PageHeading eyebrow="Made for discovery" title={page.title} description={page.description} />
    <div className="grid grid-cols-[1.35fr_1fr] items-start gap-8 max-[800px]:grid-cols-1">
      <section>
        <SectionHeading title={page.sections[0].title} />
        <div className="content-prose">{page.sections[0].paragraphs.map(text => <p key={text}>{text}</p>)}</div>
        <figure className="mt-7 rounded-xl border border-border p-5">
          <div aria-hidden="true" className="grid grid-cols-[1fr_2.8fr_1fr] gap-2 text-center">
            <div className="flex items-center justify-center rounded-md border border-accent/35 bg-accent/10 p-2 text-[0.64rem] leading-5 text-accent">Ad<br />space</div>
            <div className="rounded-md border border-border p-4"><div className="mb-4 text-[0.7rem] text-text-primary">The leaderboard</div><div className="space-y-2.5">{[1, 2, 3, 4].map(row => <div key={row} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-text-secondary/50" /><span className="h-1.5 flex-1 rounded bg-border" /><span className="h-1.5 w-5 rounded bg-border-light" /></div>)}</div></div>
            <div className="flex items-center justify-center rounded-md border border-accent/35 bg-accent/10 p-2 text-[0.64rem] leading-5 text-accent">Ad<br />space</div>
          </div>
          <figcaption className="mt-4 text-center text-xs leading-5 text-text-secondary">Placement map · desktop layouts above 1100px</figcaption>
        </figure>
      </section>
      <section className="content-card border-t-2 border-t-accent" aria-label="Monthly advertising price">
        <p className="content-eyebrow">Your next placement</p>
        <AdvertisePurchase />
        <p className="mt-5 border-t border-border pt-5 text-xs leading-6 text-text-secondary">Applicable taxes and the final amount are shown at checkout. Renews until cancelled or the subscription term ends.</p>
      </section>
    </div>
    <section className="content-section content-divider">
      <div className="grid grid-cols-2 gap-10 max-[760px]:grid-cols-1">
        {page.sections.slice(2).map((section, index) => <div key={section.id} id={section.id}><p className="mb-4 font-mono text-xs text-accent">0{index + 1}</p><h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">{section.title}</h2><div className="content-prose">{section.paragraphs.map(text => <p key={text}>{text}</p>)}</div></div>)}
      </div>
    </section>
    <div className="content-section flex flex-wrap items-center gap-4"><Link href="/submit" className="content-action-secondary">Submit your website first</Link><a href={`mailto:${siteConfig.email}`} className="content-link text-sm">Talk about a placement</a></div>
    <div className="mt-8 flex flex-wrap gap-6 text-xs"><Link href="/terms#ad-slots" className="content-link">Advertising terms</Link><MarkdownLink path="/advertise" className="content-link" /></div>
  </PageShell>;
}
