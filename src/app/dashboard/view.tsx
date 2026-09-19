import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRightIcon, ArrowUpRightIcon, MedalIcon } from "@phosphor-icons/react/dist/ssr";
import type { getDashboard } from "@/modules/dashboard/queries";
import type { getOwnFounder } from "@/modules/founders/service";
import type { listAvailableAdInventory } from "@/modules/payments/ads";
import type { listProducts } from "@/modules/payments/service";
import type { getNotificationPreferences } from "@/modules/notifications/service";
import { notificationTemplates, templateSchema } from "@/modules/notifications/templates";
import { monogram } from "@/components/directory/WebsiteList";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";
import { CheckoutButton, FounderForm, NotificationRead, PreferencesForm, RetestButton } from "./controls";
import Collaborators from "./collaborators";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
type OwnedSite = Dashboard["ownedSites"][number];
type Tone = "good" | "warn" | "bad" | "neutral";

export type DashboardViewProps = {
  userName: string;
  data: Dashboard;
  profile: Awaited<ReturnType<typeof getOwnFounder>>;
  countries: { code: string; name: string }[];
  preferences: Awaited<ReturnType<typeof getNotificationPreferences>>;
  products: Awaited<ReturnType<typeof listProducts>>;
  adInventory: Awaited<ReturnType<typeof listAvailableAdInventory>>;
  siteCursor?: string;
};

const workspaceAreas = [
  ["Performance history", "Latest measurements from the shared daily monitoring schedule."],
  ["Rankings and awards", "Finalized results with published measurement evidence."],
  ["Ownership claims", "Verification proves domain control."],
  ["Plans and purchases", "Current access and recent checkouts, kept separate from website status."],
  ["Email preferences", "Optional updates. Marketing is off unless you enable it."],
];

/** Shown in the public demo, where sign-in is switched off. */
export function DashboardSignedOut() {
  return <div className="page-shell mx-auto max-w-[1240px]">
    <p className="page-eyebrow">Account workspace</p>
    <h1 className="page-title mt-4">Your websites, in one place.</h1>
    <div className="mt-6 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
      <p className="page-description">The account workspace brings together performance history, rankings, ownership claims, purchases and email preferences.</p>
      <div className="flex flex-wrap items-center gap-3"><Link href="/" className="button-primary">Explore the directory <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link><Link href="/test" className="button-secondary">Test a site</Link></div>
    </div>
    <div className="panel mt-12 grid gap-10 p-7 sm:mt-16 sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
      <div>
        <p className="page-eyebrow mb-4">Demo preview</p>
        <h2 className="section-title max-w-[14ch]">Sign-in is switched off here.</h2>
        <p className="mt-5 max-w-[46ch] leading-relaxed text-text-secondary">Sign-in is disabled in this public demo while the final Google OAuth domain is configured. You can still explore the directory and the rankings.</p>
      </div>
      <ol className="self-end text-[15px]">
        {workspaceAreas.map(([area, detail], index) => <li key={area} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-border py-4 last:border-b sm:grid-cols-[2.75rem_minmax(0,1fr)]">
          <span aria-hidden className="stat-value pt-0.5 text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
          <span><span className="block font-semibold text-text-primary">{area}</span><span className="mt-1 block text-sm leading-relaxed text-text-secondary">{detail}</span></span>
        </li>)}
      </ol>
    </div>
  </div>;
}

export function DashboardView({ userName, data, profile, countries, preferences, products, adInventory, siteCursor }: DashboardViewProps) {
  const stats: [string, number, string][] = [["Owned websites", data.totals.websites, "#websites"], ["Current access grants", data.totals.grants, "#plan"], ["Unread notifications", data.totals.unread, "#notifications"], ["Pending claims", data.totals.claims, "#claims"]];
  const screenshots = data.screenshots.filter((capture) => capture.publicUrl.startsWith("https://"));
  const jumps = [["#websites", "Websites"], ["#rankings", "Rankings"], ["#notifications", "Notifications"], ["#plan", "Plan"], ["#email", "Email"], ["#claims", "Claims"],
    ...(data.screenshots.length > 0 ? [["#screenshots", "Screenshots"]] : []), ["#profile", "Founder profile"], ["#collaborations", "Collaborations"], ["#plans", "Available plans"],
    ...(data.advertisements.length > 0 ? [["#ads", "Ad placements"]] : [])];
  return <div className="page-shell mx-auto max-w-[1240px]">
    <header>
      <p className="page-eyebrow">Your workspace</p>
      <h1 className="page-title mt-4 break-words">Welcome, {userName.split(" ")[0]}.</h1>
      <div className="mt-6 flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <p className="page-description">Keep your websites fast, verified and ready for the next ranking.</p>
        <div className="flex flex-wrap items-center gap-3"><Link href="/submit" className="button-primary">Submit website <ArrowUpRightIcon size={16} weight="bold" aria-hidden /></Link><Link href="/test" className="button-secondary">Test a site</Link></div>
      </div>
    </header>

    <dl className="mt-12 grid grid-cols-2 gap-x-6 sm:mt-16 sm:gap-x-10 lg:grid-cols-4">
      {stats.map(([label, value, href]) => <div key={label} className="border-t border-border-light pb-8 pt-4">
        <dt className="text-[13px] leading-snug text-text-secondary"><a href={href} className="no-underline hover:text-text-primary hover:underline hover:decoration-brand hover:decoration-2 hover:underline-offset-4">{label}</a></dt>
        <dd className="stat-value mt-3 text-[clamp(2.25rem,4.6vw,3.75rem)] font-medium leading-none">{value}</dd>
      </div>)}
    </dl>

    <nav aria-label="Dashboard sections" className="flex gap-2 overflow-x-auto px-0.5 py-1 [scrollbar-width:none] sm:flex-wrap">
      {jumps.map(([href, label]) => <a key={href} href={href} className="chip flex-none">{label}</a>)}
    </nav>

    <section id="websites" aria-labelledby="websites-title" className="scroll-mt-28 pb-16 pt-14 sm:pb-24 sm:pt-20">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-3"><h2 id="websites-title" className="section-title">My websites</h2><p className="max-w-[48ch] text-sm leading-relaxed text-text-secondary">Latest measurements from the shared daily monitoring schedule. Scores are out of 100.</p></div>
      {data.ownedSites.length ? <>
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Your websites with their latest recorded performance score out of 100</caption>
          <thead className="border-b border-border-light text-xs text-text-muted"><tr>
            <th scope="col" className="py-3 font-medium">Website</th>
            <th scope="col" className="hidden w-60 px-4 py-3 font-medium md:table-cell xl:w-72">Status</th>
            <th scope="col" className="hidden w-44 px-4 py-3 font-medium lg:table-cell"><span className="sr-only">Score scale</span><span aria-hidden className="flex justify-between"><span>0</span><span>100</span></span></th>
            <th scope="col" className="w-14 px-2 py-3 text-right font-medium sm:w-20 sm:px-4">Score</th>
            <th scope="col" className="w-[6.5rem] py-3 text-right font-medium sm:w-28 xl:w-40"><span className="sr-only">Retest</span></th>
          </tr></thead>
          <tbody>{data.ownedSites.map((site) => <tr key={site.id} className="group border-b border-border transition-colors hover:bg-bg-main">
            <td className="py-4 pr-2">
              <Link href={`/site/${site.slug}`} className="flex min-w-0 items-center gap-3 no-underline">
                <span aria-hidden className="monogram transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(site.name)}</span>
                <span className="min-w-0"><span className="block truncate text-[15px] font-semibold text-text-primary">{site.name}</span><span className="mt-0.5 block text-[13px] leading-snug text-text-muted">{site.lastTestedAt ? <><span className="max-sm:sr-only">Last measured </span>{site.lastTestedAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC</> : "No verified measurement yet"}</span></span>
              </Link>
              <div className="mt-3 md:hidden"><SiteStatus site={site} /></div>
            </td>
            <td className="hidden px-4 py-4 md:table-cell"><SiteStatus site={site} /></td>
            <td className="hidden px-4 py-4 lg:table-cell"><ScoreTicks score={site.lastTestedAt ? site.score : null} /></td>
            <td className="stat-value px-2 py-4 text-right text-2xl font-medium sm:px-4"><span className={scoreTone(site.score, Boolean(site.lastTestedAt))}>{site.lastTestedAt ? site.score : "—"}</span></td>
            <td className="py-4 text-right"><RetestButton slug={site.slug} /></td>
          </tr>)}</tbody>
        </table>
        <p className="mt-4 text-xs text-text-muted">Retests: one shared daily measurement.</p>
      </> : <GetStarted />}
      {(data.nextSiteCursor || siteCursor) && <div className="mt-8 flex flex-wrap gap-3">
        {data.nextSiteCursor && <Link className="button-secondary" href={`/dashboard?siteCursor=${data.nextSiteCursor}`}>Next 50 websites</Link>}
        {siteCursor && <Link className="button-secondary" href="/dashboard">First website page</Link>}
      </div>}
    </section>

    <Section id="rankings" title="Rankings and awards" detail="Finalized results with published measurement evidence.">
      {data.rankings.length ? <table className="w-full table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Finalized rankings of your websites</caption>
        <thead className="border-b border-border-light text-xs text-text-muted"><tr><th scope="col" className="w-14 py-3 font-medium sm:w-16">Rank</th><th scope="col" className="py-3 font-medium">Website</th><th scope="col" className="hidden w-[36%] px-4 py-3 font-medium sm:table-cell">Competition</th><th scope="col" className="w-20 py-3 text-right font-medium sm:w-24">Points</th></tr></thead>
        <tbody>{data.rankings.map((rank, index) => <tr key={`${rank.period}-${rank.scope}-${index}`} className="border-b border-border">
          <td className={"stat-value py-3.5 text-lg font-medium " + (rank.rank <= 3 ? "text-accent" : "text-text-primary")}>{rank.rank}</td>
          <td className="py-3.5 pr-3"><span className="block truncate font-semibold">{rank.siteName}</span><span className="mt-0.5 block text-xs text-text-muted sm:hidden"><span className="stat-value">{rank.period}</span>, {rank.scope}{rank.scopeKey ? ` / ${rank.scopeKey}` : ""}</span></td>
          <td className="hidden px-4 py-3.5 sm:table-cell"><span className="stat-value block truncate text-[13px] text-text-primary">{rank.period}</span><span className="mt-0.5 block truncate text-xs text-text-muted first-letter:uppercase">{rank.scope}{rank.scopeKey ? ` / ${rank.scopeKey}` : ""}</span></td>
          <td className="stat-value py-3.5 text-right text-text-secondary">{rank.score.toFixed(1)}</td>
        </tr>)}</tbody>
      </table> : <Empty>No finalized rankings yet. Results are listed here once a competition is finalized.</Empty>}
      {data.awards.length > 0 && <div className="mt-10"><h3 className="text-base font-semibold">Awards</h3><ul className="mt-3">{data.awards.map((award, index) => <li key={index} className="flex items-center gap-3 border-t border-border py-3.5 last:border-b">
        <span aria-hidden className="monogram h-9 w-9 rounded-[10px] bg-brand text-on-brand shadow-none"><MedalIcon size={18} weight="fill" /></span>
        <span className="min-w-0"><span className="block truncate text-sm font-semibold">{award.title}</span><span className="block truncate text-[13px] text-text-muted">{award.siteName}</span></span>
      </li>)}</ul></div>}
    </Section>

    <Section id="notifications" title="Notifications" detail="Recent account, monitoring and competition updates.">
      {data.messages.length ? <ul>{data.messages.map((message) => <NotificationItem key={message.id} message={message} />)}</ul> : <Empty>No notifications yet. Account, monitoring and competition updates will be listed here.</Empty>}
    </Section>

    <Section id="plan" title="Current plan and purchases" detail="Your entitlement history remains independent of website status.">
      {data.grants.length ? <ul>{data.grants.map((grant) => <li key={grant.id} className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-t border-border py-4 last:border-b">
        <span><strong className="block font-semibold first-letter:uppercase">{grant.kind.replaceAll("_", " ")}</strong><span className="mt-0.5 block text-[13px] text-text-muted">{grant.source === "legacy" ? "Preserved existing access" : "Dodo purchase"}</span></span>
        <span className="text-sm text-text-secondary">{grant.endsAt ? <>Until <span className="stat-value">{grant.endsAt.toLocaleDateString("en-GB")}</span></> : "No fixed expiry"}</span>
      </li>)}</ul> : <Empty>No paid access is active. <a href="#plans" className="link-underline">See available plans</a></Empty>}
      {data.orders.length > 0 && <div className="mt-10"><h3 className="text-base font-semibold">Recent checkouts</h3><ul className="mt-3">{data.orders.map((order) => <li key={order.id} className="border-t border-border py-3.5 last:border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"><span className="min-w-0 break-words text-sm font-medium">{order.title}</span><StatusPill tone={statusTone(order.status)}>{order.status}</StatusPill></div>
        {["creating", "uncertain"].includes(order.status) && <p className="mt-2 text-[13px] leading-relaxed text-orange">This checkout needs reconciliation. Do not repeat the purchase.</p>}
      </li>)}</ul></div>}
      {data.payments.length > 0 && <div className="mt-10"><h3 className="text-base font-semibold">Payments</h3><ul className="mt-3">{data.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border py-3.5 last:border-b">
        <span className="stat-value text-[15px] font-medium">{formatMoney(payment.amountCents, payment.currency)}</span>
        <span className="flex items-center gap-4"><StatusPill tone={statusTone(payment.status)}>{payment.status}</StatusPill><span className="stat-value text-[13px] text-text-muted">{payment.occurredAt.toLocaleDateString("en-GB")}</span></span>
      </li>)}</ul></div>}
    </Section>

    <Section id="email" title="Email preferences" detail="Choose optional updates. Marketing is off unless you enable it."><PreferencesForm initial={preferences} /></Section>

    <Section id="claims" title="Ownership claims" detail="Verification proves domain control. Existing ownership transfers require review.">
      {data.claims.length ? <ul>{data.claims.map((claim) => <li key={claim.id} className="border-t border-border py-4 last:border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"><span className="font-semibold first-letter:uppercase">{claim.method.replaceAll("_", " ")}</span><span className="flex items-center gap-4"><StatusPill tone={statusTone(claim.status)}>{claim.status}</StatusPill><span className="text-[13px] text-text-muted">Expires <span className="stat-value">{claim.expiresAt.toLocaleDateString("en-GB")}</span></span></span></div>
        <p className="stat-value mt-1.5 break-all text-xs text-text-muted"><span className="sr-only">Claim ID </span>{claim.id}</p>
      </li>)}</ul> : <Empty>You have no ownership claims. Start a claim from a website page. <Link href="/explore" className="link-underline">Explore websites</Link></Empty>}
    </Section>

    {data.screenshots.length > 0 && <Section id="screenshots" title="Recent screenshots" detail="Latest retained public captures of your websites.">
      <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2">{screenshots.map((capture, index) => <a href={capture.publicUrl} target="_blank" rel="noopener noreferrer" key={index} className="group block no-underline">
        <span className="block overflow-hidden rounded-xl border border-border bg-bg-card"><Image src={capture.publicUrl} alt={`${capture.siteName} ${capture.device} screenshot`} width={640} height={400} unoptimized className="aspect-[8/5] w-full object-cover object-top transition-transform duration-500 ease-out group-hover:scale-[1.03]" /></span>
        <span className="mt-3 flex items-baseline justify-between gap-4"><span className="min-w-0 truncate text-sm font-semibold text-text-primary">{capture.siteName}</span><span className="stat-value flex-none text-xs text-text-muted">{capture.capturedAt.toLocaleDateString("en-GB")}</span></span>
        <span className="mt-0.5 block text-[13px] text-text-muted first-letter:uppercase">{capture.device}</span>
      </a>)}</div>
    </Section>}

    <Section id="profile" title="Founder profile" detail="Your profile stays private until you choose to publish it."><FounderForm initial={profile} name={userName} countries={countries} sites={data.ownedSites} /></Section>

    <Section id="collaborations" title="Founder collaborations" detail="Website attribution by invitation and explicit consent."><Collaborators profileVersion={profile?.updatedAt.toISOString() ?? null} /></Section>

    <Section id="plans" title="Available plans" detail="Server-verified products and prices. Checkout alone does not grant access.">
      {products.length ? <div>{products.map((product) => <article key={product.key} className="grid gap-x-12 gap-y-5 border-t border-border py-7 last:border-b md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div><h3 className="text-xl font-semibold tracking-[-.03em]">{product.title}</h3><p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1"><span className="stat-value text-3xl font-medium text-text-primary">{formatMoney(product.amountCents, product.currency)}</span><span className="text-sm text-text-secondary">{product.billingInterval !== "one_time" ? `/ ${product.billingInterval}` : "one time"}</span></p><p className="mt-1.5 text-xs text-text-muted">before applicable tax</p></div>
        <CheckoutButton productKey={product.key} requiresSite={product.requiresSite} sites={data.ownedSites} adInventory={product.kind === "sidebar_ad" ? adInventory : undefined} />
      </article>)}</div> : <Empty>New purchases are currently unavailable. Existing access remains visible above.</Empty>}
    </Section>

    {data.advertisements.length > 0 && <Section id="ads" title="Ad placements" detail="Paid creative is reviewed before publication. Held checkout capacity remains reserved until the provider outcome is reconciled.">
      <ul>{data.advertisements.map((ad) => <li key={ad.id} className="border-t border-border py-4 last:border-b">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2"><strong className="font-semibold first-letter:uppercase">{ad.position} sidebar, position <span className="stat-value">{ad.orderIndex}</span></strong><StatusPill tone={statusTone(ad.status)}>{ad.status}</StatusPill></div>
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-text-muted">{ad.endsAt ? `Publication window ends ${ad.endsAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : ad.status === "paid" ? "Payment confirmed; creative review is pending. The purchased duration begins at approval." : ad.status === "held" ? "Checkout is pending or needs reconciliation. Do not start another purchase for this placement." : "No active publication window."}</p>
      </li>)}</ul>
    </Section>}

    <p className="max-w-[86ch] border-t border-border pt-6 text-xs leading-relaxed text-text-muted">This workspace shows 50 websites per page, up to 100 current access grants and the latest 30 account events. Totals include all matching records. Payment and ranking summaries use application records, not third-party analytics estimates.</p>
  </div>;
}

/** A settings-style ledger row: the heading and its note on the left, the records on the right. */
function Section({ id, title, detail, children }: { id: string; title: string; detail: string; children: ReactNode }) {
  return <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-28 gap-x-14 gap-y-7 pb-16 sm:pb-24 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
    <div><h2 id={`${id}-title`} className="section-title text-[clamp(1.375rem,2.1vw,1.75rem)]">{title}</h2><p className="mt-3 max-w-[44ch] text-sm leading-relaxed text-text-secondary">{detail}</p></div>
    <div className="min-w-0">{children}</div>
  </section>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="border-y border-dashed border-border-light py-6 text-sm leading-relaxed text-text-secondary">{children}</p>;
}

function GetStarted() {
  const steps = [
    ["Submit website", "Add a website you run to the directory. It joins the shared daily monitoring schedule."],
    ["Claim a listed website", "If it is already in the directory, start a claim from its website page. Verification proves domain control."],
    ["Test a site", "Run a measurement first to see where it stands."],
  ];
  return <div className="panel grid gap-10 p-7 sm:p-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
    <div>
      <h3 className="section-title max-w-[13ch]">No websites yet.</h3>
      <p className="mt-5 max-w-[44ch] leading-relaxed text-text-secondary">Add a website or verify a claim to start monitoring.</p>
      <div className="mt-8 flex flex-wrap items-center gap-3"><Link href="/submit" className="button-ink">Submit website <ArrowUpRightIcon size={16} weight="bold" aria-hidden /></Link><Link href="/test" className="button-secondary">Test a site</Link></div>
    </div>
    <ol className="self-end text-[15px]">{steps.map(([step, detail], index) => <li key={step} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-t border-border py-4 last:border-b sm:grid-cols-[2.75rem_minmax(0,1fr)]">
      <span aria-hidden className="stat-value pt-0.5 text-xs text-text-muted">{String(index + 1).padStart(2, "0")}</span>
      <span><span className="block font-semibold text-text-primary">{step}</span><span className="mt-1 block text-sm leading-relaxed text-text-secondary">{detail}</span></span>
    </li>)}</ol>
  </div>;
}

function SiteStatus({ site }: { site: OwnedSite }) {
  const lifecycleTone: Tone = ["active", "verified"].includes(site.lifecycle) ? "good" : ["submitted", "pending", "redirected"].includes(site.lifecycle) ? "warn" : ["unreachable", "suspended", "removed"].includes(site.lifecycle) ? "bad" : "neutral";
  return <div className="min-w-0">
    <div className="flex flex-wrap items-center gap-1.5"><StatusPill tone={lifecycleTone}>{site.lifecycle}</StatusPill>{site.isPro && <span className="inline-flex min-h-6 items-center rounded-full bg-brand px-2.5 text-xs font-semibold text-on-brand">Pro</span>}</div>
    <p className="mt-1.5 text-xs leading-snug text-text-muted">{site.isPro ? "Badge exempt" : `Badge ${site.badgeStatus.replaceAll("_", " ")}`}, {site.monitoringPaused ? <span className="font-medium text-orange">monitoring paused</span> : "monitoring enabled"}</p>
  </div>;
}

function statusTone(status: string): Tone {
  if (["active", "paid", "succeeded", "completed", "verified", "approved", "fulfilled"].includes(status)) return "good";
  if (["pending", "creating", "uncertain", "held", "processing", "open", "created"].includes(status)) return "warn";
  if (["failed", "rejected", "cancelled", "expired", "refunded", "released", "disputed"].includes(status)) return "bad";
  return "neutral";
}

function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const tones = { good: "bg-green-dim text-green", warn: "bg-orange-dim text-orange", bad: "bg-red-dim text-red", neutral: "bg-bg-card text-text-secondary" };
  return <span className={"inline-flex min-h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium " + tones[tone]}><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /><span className="first-letter:uppercase">{children}</span></span>;
}

function NotificationItem({ message }: { message: Dashboard["messages"][number] }) {
  const template = templateSchema.safeParse(message.type), detail = message.details;
  const facts = detail.score !== undefined || detail.rank !== undefined || Boolean(detail.period);
  return <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t border-border py-5 last:border-b">
    <div className="flex min-w-0 flex-1 basis-64 gap-3.5">
      <span aria-hidden className={"mt-[7px] h-2 w-2 flex-none rounded-full " + (message.readAt ? "bg-border-light" : "bg-brand shadow-[0_0_0_4px_var(--amber-soft)]")} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-snug first-letter:uppercase">{template.success ? notificationTemplates[template.data].subject : message.type.replaceAll("_", " ")}{!message.readAt && <span className="sr-only"> (unread)</span>}</p>
        {detail.siteName && <p className="mt-1 break-words text-sm text-text-secondary">{detail.siteName}</p>}
        {facts && <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {detail.score !== undefined && <div className="flex items-center gap-1.5"><dt className="text-text-muted">Score</dt><dd className="stat-value flex items-center gap-1 text-text-primary">{detail.previousScore !== undefined && <><span className="text-text-muted">{detail.previousScore}</span><ArrowRightIcon size={11} weight="bold" aria-hidden /><span className="sr-only"> to </span></>}<span className={scoreTone(detail.score)}>{detail.score}</span><span className="text-text-muted">/100</span></dd></div>}
          {detail.rank !== undefined && <div className="flex items-center gap-1.5"><dt className="text-text-muted">Rank</dt><dd className="stat-value text-text-primary">{detail.rank}</dd></div>}
          {detail.period && <div className="flex items-center gap-1.5"><dt className="text-text-muted">Period</dt><dd className="stat-value text-text-primary">{detail.period}</dd></div>}
        </dl>}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-text-muted"><time className="stat-value" dateTime={message.createdAt.toISOString()}>{message.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })} UTC</time>{detail.actionPath && <Link href={detail.actionPath} className="link-underline text-[13px]">View details</Link>}</p>
      </div>
    </div>
    {!message.readAt && <NotificationRead id={message.id} />}
  </li>;
}

function formatMoney(amount: number, currency: string) { const formatter = new Intl.NumberFormat("en", { style: "currency", currency }); return formatter.format(amount / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2)); }
