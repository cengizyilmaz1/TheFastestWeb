import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { ScalesIcon } from "@phosphor-icons/react/dist/ssr";
import { siteConfig } from "@/config/site";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { listProducts } from "@/modules/payments/service";
import { listAvailableAdInventory } from "@/modules/payments/ads";
import { isPaymentsEnabled } from "@/infrastructure/payments/dodo";
import { PricingTiers } from "@/components/pricing/PricingTiers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans and pricing", description: "Start with a free verified website listing. Explore available plans and sponsorship opportunities.", alternates: { canonical: `${siteConfig.url}/pricing` } };

const questions: { question: string; answer: ReactNode }[] = [
  { question: "What happens to existing Pro access?", answer: "Your current access is preserved. Sign in to review your membership and the plans linked to your websites." },
  { question: "Can I buy a sidebar placement?", answer: "Choose an available placement before checkout. We review your creative after payment, and your placement starts when approved. Existing placements keep their original expiry date." },
  { question: "How do I pay?", answer: "Complete your purchase with Dodo Payments. Once payment is confirmed, your access becomes available and you can review the amount and tax in your payment history." },
  { question: "How do rankings work?", answer: <>Rankings use published measurement rules and finalized evidence. <Link href="/methodology" className="link-underline">Read the methodology</Link> before comparing results.</> },
];

export default async function PricingPage() {
  const [user, products, adInventory] = await Promise.all([getCurrentUser(), listProducts(), isPaymentsEnabled() ? listAvailableAdInventory() : Promise.resolve([])]);
  const db = getDb();
  const ownedSites = user && db ? await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.ownerId, user.id)).orderBy(sites.id).limit(100) : [];
  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <header className="pb-12 sm:pb-16">
      <h1 className="page-title">Start free.<br />Grow with evidence.</h1>
      <div className="mt-8 flex flex-col justify-between gap-8 lg:flex-row lg:items-end lg:gap-16">
        <p className="page-description">List your website, measure what matters and build a public performance record.</p>
        <p className="flex max-w-[44ch] items-start gap-3 border-t border-border-light pt-4 text-[15px] leading-relaxed text-text-secondary"><ScalesIcon size={20} className="mt-0.5 flex-none text-text-primary" aria-hidden />Paid placement never changes measured scores or competitive ranking rules.</p>
      </div>
    </header>

    <PricingTiers products={products} signedIn={Boolean(user)} sites={ownedSites} adInventory={adInventory} />

    <section className="pt-20 sm:pt-28">
      <h2 className="section-title">Before you choose.</h2>
      <div className="mt-10 border-b border-border">
        {questions.map(({ question, answer }) => <div key={question} className="grid gap-x-16 gap-y-3 border-t border-border py-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <h3 className="text-xl font-semibold leading-snug tracking-[-.03em]">{question}</h3>
          <p className="max-w-[62ch] leading-relaxed text-text-secondary">{answer}</p>
        </div>)}
      </div>
    </section>
  </div>;
}
