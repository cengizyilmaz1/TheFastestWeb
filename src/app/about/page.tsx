import Link from "next/link";
import { ArrowRight, ChartLine, Gauge, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import { PageHeading, PageShell, SectionHeading } from "@/components/content/PageShell";
import { siteConfig } from "@/config/site";
import { aboutPage } from "@/content/about";
import { pageMetadata } from "@/lib/seo/metadata";
import { webPageSchema } from "@/lib/seo/structured-data";
import { safeJsonLd } from "@/lib/seo/json-ld";

export const metadata = pageMetadata({ title: "About our performance measurements", description: aboutPage.description, path: aboutPage.path });

export default function AboutPage() {
  const [purpose, measurements, rankings, privacy, operator] = aboutPage.sections;
  const measurementDetails = [
    { icon: Gauge, title: "One test, recorded conditions" },
    { icon: ChartLine, title: "The details behind the number" },
    { icon: ShieldCheck, title: "A clear boundary between lab and field" },
  ];
  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(webPageSchema({ path: aboutPage.path, name: aboutPage.title, description: aboutPage.description, type: "AboutPage", trail: [{ name: siteConfig.name, path: "/" }, { name: "About", path: "/about" }] })) }} />
      <PageHeading eyebrow="About TheFastestWeb" title={<>A faster web starts<br className="hidden sm:block" /> with a clearer picture.</>} description="Measure your website, understand the results, and discover what a fast experience looks like.">
        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link href="/test" className="content-action">Test your website <ArrowRight size={18} aria-hidden="true" /></Link>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native navigation to a text/markdown document, not an App Router page. */}
        <a href="/markdown/about" className="content-link text-sm">Read as Markdown</a>
        </div>
      </PageHeading>

      <section className="content-section grid gap-8 lg:grid-cols-[1.4fr_1fr]" aria-labelledby={purpose.id}>
        <div>
          <h2 id={purpose.id} className="font-display text-3xl font-semibold tracking-tight mb-5">{purpose.title}</h2>
          <div className="content-prose">{purpose.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </div>
        <aside id={operator.id} className="content-card self-start">
          <p className="text-sm text-text-secondary mb-4">{operator.title}</p>
          <a href={siteConfig.ownerUrl} className="font-display text-2xl font-semibold tracking-tight content-link">{siteConfig.ownerName}</a>
          <p className="text-sm leading-7 text-text-secondary mt-3 mb-5">{operator.paragraphs[1]}</p>
          <a href={`mailto:${siteConfig.email}`} className="content-link text-sm break-all">{siteConfig.email}</a>
        </aside>
      </section>

      <section id={measurements.id} className="content-section" aria-label="How measurements work">
        <SectionHeading title={measurements.title} description={measurements.paragraphs[0]} />
        <div className="space-y-7">
          {measurementDetails.map(({ icon: Icon, title }, index) => (
            <div key={title} className="grid grid-cols-[36px_1fr] gap-4 sm:gap-6">
              <Icon size={28} weight="regular" className="text-accent mt-1" aria-hidden="true" />
              <div><h3 className="font-display text-xl font-semibold tracking-tight mb-2">{title}</h3><p className="max-w-[65ch] text-text-secondary text-[0.94rem] leading-7">{measurements.bullets[index]}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="content-section grid gap-8 sm:grid-cols-2" aria-label="Our principles">
        <div><h2 id={rankings.id} className="font-display text-2xl font-semibold tracking-tight mb-3">{rankings.title}</h2><p className="text-text-secondary text-[0.94rem] leading-7">{rankings.paragraphs[0]}</p></div>
        <div><h2 id={privacy.id} className="font-display text-2xl font-semibold tracking-tight mb-3">{privacy.title}</h2><p className="text-text-secondary text-[0.94rem] leading-7">{privacy.paragraphs[0]}</p><Link href="/privacy" className="content-link inline-flex items-center gap-2 mt-4 text-sm">Read our privacy policy <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </section>

      <div className="content-note mt-12 flex flex-wrap items-center justify-between gap-5">
        <div><h2 className="font-display text-2xl font-semibold tracking-tight mb-2">Put your website on the map.</h2><p className="text-sm text-text-secondary">Publish a listing and let the measurements speak.</p></div>
        <Link href="/submit" className="content-action-secondary">Submit your site <ArrowRight size={18} aria-hidden="true" /></Link>
      </div>
    </PageShell>
  );
}
