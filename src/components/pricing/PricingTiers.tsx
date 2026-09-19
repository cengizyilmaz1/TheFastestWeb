import Link from "next/link";
import { ArrowRightIcon, ArrowUpRightIcon, CheckIcon } from "@phosphor-icons/react/dist/ssr";
import { CheckoutButton } from "@/app/dashboard/controls";
import type { listProducts } from "@/modules/payments/service";

type Product = Awaited<ReturnType<typeof listProducts>>[number];

const included = [
  "Server-verified performance evidence",
  "Public website profile and leaderboard eligibility",
  "Ownership verification and founder profile",
  "Badge eligibility and transparent ranking methodology",
];

function kindLabel(kind: string) {
  const label = kind.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatPrice(product: Product) {
  const formatter = new Intl.NumberFormat("en", { style: "currency", currency: product.currency });
  return formatter.format(product.amountCents / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}

/** The free listing is the recommended plan, so it takes the brand surface. It is a wide band, not a tower. */
function FreePlan() {
  return <article className="surface-brand relative overflow-hidden rounded-[28px] px-7 pb-8 pt-9 sm:px-12 sm:pb-10 sm:pt-12">
    <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <div>
        <h2 className="text-lg font-semibold tracking-[-.02em] text-text-primary">Directory listing</h2>
        <p className="mt-2 text-[clamp(3.75rem,9vw,7.25rem)] font-bold leading-[.92] tracking-[-.055em] text-text-primary font-stretch-[125%]">Free</p>
        <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-text-secondary">Submit a website for a verified performance measurement, public profile and fair rankings.</p>
        <Link href="/submit" className="button-ink mt-8 min-h-12 px-6 text-[15px]">Submit website <ArrowUpRightIcon size={18} weight="bold" aria-hidden /></Link>
      </div>
      <ul className="self-end text-[15px] font-medium text-text-primary">
        {included.map((item) => <li key={item} className="flex items-start gap-3.5 border-t border-border py-4 last:border-b">
          <CheckIcon size={18} weight="bold" className="mt-[3px] flex-none" aria-hidden />{item}
        </li>)}
      </ul>
    </div>
    <div aria-hidden className="tick-rule mt-10 opacity-70 sm:mt-12" />
  </article>;
}

/** One row of the rate card: what it is, its terms, then the price and the action in a fixed column so every action starts on the same line. */
function PlanRow({ product, signedIn, sites, adInventory }: { product: Product; signedIn: boolean; sites: { id: string; name: string }[]; adInventory: { id: string; position: string; orderIndex: number }[] }) {
  const terms: [string, string][] = [
    ["Billing", product.billingInterval === "one_time" ? "One-time payment" : `Billed every ${product.billingInterval}`],
    ["Applies to", product.requiresSite ? "The owned website you select" : "Your account"],
    ["Access", product.entitlementDays ? `${product.entitlementDays} days` : product.billingInterval === "one_time" ? "No fixed expiry" : "Follows your active subscription period"],
  ];
  return <article className="grid gap-x-12 gap-y-7 border-t border-border py-9 sm:py-11 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
    <div>
      <p className="page-eyebrow">{kindLabel(product.kind)}</p>
      <h3 className="mt-4 max-w-[16ch] text-[clamp(1.6rem,2.6vw,2.125rem)] font-semibold leading-[1.08] tracking-[-.04em] font-stretch-[116%]">{product.title}</h3>
    </div>
    <dl className="self-start text-[15px]">
      {terms.map(([term, value]) => <div key={term} className="flex items-baseline justify-between gap-6 border-t border-border py-3.5 first:border-t-0 first:pt-0 last:pb-0">
        <dt className="text-text-secondary">{term}</dt><dd className="text-right font-semibold text-text-primary">{value}</dd>
      </div>)}
    </dl>
    <div>
      <p className="stat-value text-[2.5rem] font-medium leading-none text-text-primary">{formatPrice(product)}</p>
      <p className="mt-2.5 text-[13px] text-text-muted">Before applicable tax</p>
      {signedIn
        ? <div className="mt-3"><CheckoutButton productKey={product.key} requiresSite={product.requiresSite} sites={sites} adInventory={product.kind === "sidebar_ad" ? adInventory : undefined} /></div>
        : <Link className="button-secondary mt-6" href="/auth/login?returnTo=%2Fpricing">Sign in to choose this plan <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>}
    </div>
  </article>;
}

export function PricingTiers({ products, signedIn, sites, adInventory }: {
  products: Awaited<ReturnType<typeof listProducts>>; signedIn: boolean; sites: { id: string; name: string }[]; adInventory: { id: string; position: string; orderIndex: number }[];
}) {
  return <>
    <FreePlan />
    {products.length > 0 ? <section className="pt-20 sm:pt-28">
      <h2 className="section-title">Paid plans and sponsorship.</h2>
      <p className="mt-5 max-w-[52ch] leading-relaxed text-text-secondary">Choose the plan that fits your next step. Complete checkout with Dodo Payments; your access starts after payment is confirmed.</p>
      <div className="mt-10 border-b border-border">
        {products.map((product) => <PlanRow key={product.key} product={product} signedIn={signedIn} sites={sites} adInventory={adInventory} />)}
      </div>
    </section> : <section className="pt-20 sm:pt-28">
      <h2 className="section-title">New plans are being prepared.</h2>
      <div className="mt-6 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <p className="max-w-[58ch] leading-relaxed text-text-secondary">Paid plans are not available yet. Start with a free listing, or sign in to review the access you already have.</p>
        <Link href="/dashboard" className="button-secondary flex-none self-start lg:self-auto">View existing access <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>
      </div>
    </section>}
  </>;
}
