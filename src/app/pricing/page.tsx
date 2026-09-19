import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { siteConfig } from "@/config/site";
import { getDb } from "@/db";
import { sites } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { listProducts } from "@/modules/payments/service";
import { listAvailableAdInventory } from "@/modules/payments/ads";
import { isPaymentsEnabled } from "@/infrastructure/payments/dodo";
import { PricingTiers } from "@/components/pricing/PricingTiers";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Plans and pricing", description: "Start with a free verified website listing. Explore available plans and preserved account access.", alternates: { canonical: `${siteConfig.url}/pricing` } };
export default async function PricingPage() {
  const [user, products, adInventory] = await Promise.all([getCurrentUser(), listProducts(), isPaymentsEnabled() ? listAvailableAdInventory() : Promise.resolve([])]);
  const db = getDb();
  const ownedSites = user && db ? await db.select({ id: sites.id, name: sites.name }).from(sites).where(eq(sites.ownerId, user.id)).orderBy(sites.id).limit(100) : [];
  return <main className="page-shell"><header className="mb-10 max-w-3xl"><p className="page-eyebrow">A place for fast websites</p><h1 className="page-title mt-4">Start free.<br />Grow with evidence.</h1><p className="page-description mt-5">List your website, measure what matters and build a public performance record. Paid placement never changes measured scores or competitive ranking rules.</p></header><PricingTiers products={products} signedIn={Boolean(user)} sites={ownedSites} adInventory={adInventory} />
    <section className="mt-12 border-t border-border pt-8"><h2 className="text-2xl font-semibold tracking-tight">Before you choose</h2><div className="mt-6 grid gap-8 md:grid-cols-2"><div><h3 className="font-semibold">What happens to existing Pro access?</h3><p className="mt-3 text-sm leading-relaxed text-text-secondary">Existing memberships and valid entitlements are retained. Sign in to see the access recorded for your account and websites.</p></div><div><h3 className="font-semibold">Can I buy a sidebar placement?</h3><p className="mt-3 text-sm leading-relaxed text-text-secondary">Available sidebar products reserve a specific placement before checkout. Creative is reviewed after confirmed payment; the purchased duration starts when approved. Existing placements retain their recorded expiry.</p></div><div><h3 className="font-semibold">How are payments confirmed?</h3><p className="mt-3 text-sm leading-relaxed text-text-secondary">Checkout opens on Dodo Payments. Access is granted after a verified provider confirmation, with the final amount and tax stored in your payment history.</p></div><div><h3 className="font-semibold">How do rankings work?</h3><p className="mt-3 text-sm leading-relaxed text-text-secondary">Rankings use published measurement rules and finalized evidence. <Link href="/methodology" className="underline">Read the methodology</Link> before comparing results.</p></div></div></section>
  </main>;
}
