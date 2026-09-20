import Link from "next/link";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { pageMetadata } from "@/lib/seo/metadata";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { webPageSchema } from "@/lib/seo/structured-data";
import { PricingTiers } from "@/components/pricing/PricingTiers";
import { PageHeading, PageShell, SectionHeading } from "@/components/content/PageShell";
import { MarkdownLink } from "@/components/content/MarkdownLink";
import { getCurrentUser } from "@/lib/auth";
import { hasAccountProAccess } from "@/modules/payments/entitlements";
import { siteConfig } from "@/config/site";
import { publicPages } from "@/content/public-pages";

const page = publicPages.pricing;
export const metadata = pageMetadata({ title: "Plans and pricing", description: page.description, path: page.path });
const questions = [
  { question: "Is Pro a subscription?", answer: "No. Pro is a one-time $9 USD payment for account access with unlimited website submissions and no badge requirement. Sidebar advertising is a separate monthly subscription." },
  { question: "Do payments affect leaderboard rankings?", answer: "No. Website performance measurements determine the leaderboard. A Pro purchase or sponsored placement does not improve a measured score." },
  { question: "What does the free plan require?", answer: "Sign in with Google, submit a website you own or have permission to list, and embed the TheFastestWeb badge on its homepage. The free plan includes one website listing." },
  { question: "How are payments handled?", answer: "Dodo Payments processes checkout and billing. Applicable taxes and the final amount are displayed at checkout. TheFastestWeb does not store card numbers or card security codes." },
];

export default async function PricingPage() {
  const user = await getCurrentUser();
  const isPro = user ? await hasAccountProAccess(user.id, user.isPro) : false;
  return <PageShell>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(webPageSchema({ path: page.path, name: "Plans and pricing", description: page.description, trail: [{ name: siteConfig.name, path: "/" }, { name: "Pricing", path: page.path }] })) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: questions.map(item => ({ "@type": "Question", name: item.question, acceptedAnswer: { "@type": "Answer", text: item.answer } })) }) }} />
    <PageHeading eyebrow="Plans for independent builders" title={page.title} description={page.description} />
    <PricingTiers isPro={isPro} />
    <section className="content-section content-divider flex flex-wrap items-center justify-between gap-6">
      <div className="max-w-[510px]"><p className="content-eyebrow mb-3">Looking for visibility?</p><h2 className="font-display text-2xl font-semibold tracking-tight">A space for your product. $19/month.</h2><p className="mt-3 text-sm leading-7 text-text-secondary">One sponsored desktop sidebar placement, separate from organic rankings. Subject to inventory, listing ownership and creative approval.</p></div>
      <Link href="/advertise" className="content-action-secondary">Explore advertising <ArrowUpRight size={17} aria-hidden="true" /></Link>
    </section>
    <section className="content-section content-faq" aria-labelledby="pricing-questions"><SectionHeading title={<span id="pricing-questions">Before you choose.</span>} />{questions.map(item => <details key={item.question}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>
    <div className="content-section flex flex-wrap gap-x-6 gap-y-3 text-sm"><a href={`mailto:${siteConfig.email}`} className="content-link">Ask a question</a><Link href="/terms" className="content-link">Read the terms</Link><MarkdownLink path="/pricing" /></div>
  </PageShell>;
}
