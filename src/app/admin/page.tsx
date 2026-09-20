import Link from "next/link";
import { getOverview } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "./authorize";
import { BarList, DailyColumns, ScoreBands } from "./_components/charts";
import { formatCount, formatDate, formatDateTime, formatMoney, Empty, Monogram, PageHeader, Panel, Pill, scoreTone, StatTile, TextLink, words } from "./_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Administration overview");

export default async function AdminOverviewPage() {
  const actor = await authorizeAdmin();
  const data = await getOverview(actor);
  const { totals } = data;
  const attention = [
    totals.adsToReview > 0 && { href: "/admin/ads", text: `${formatCount(totals.adsToReview)} paid ${totals.adsToReview === 1 ? "advertisement is" : "advertisements are"} waiting for creative review` },
    totals.failedJobs > 0 && { text: `${formatCount(totals.failedJobs)} background ${totals.failedJobs === 1 ? "job has" : "jobs have"} failed` },
    data.health.redis !== "ready" && { text: `Redis reports ${words(data.health.redis)}` },
  ].filter((item): item is { href?: string; text: string } => Boolean(item));

  return <>
    <PageHeader title="Overview" description="Accounts, listed products, advertising and revenue at a glance. Figures are read live from the database." />

    {attention.length > 0 && <ul aria-label="Needs attention" className="mb-5 space-y-2">
      {attention.map((item) => <li key={item.text} className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-orange/30 bg-orange-dim px-4 py-3 text-[0.82rem] text-text-primary">
        <span>{item.text}.</span>{item.href && <TextLink href={item.href}>Review</TextLink>}</li>)}
    </ul>}

    <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
      <StatTile label="Registered users" value={formatCount(totals.users)} hint={`${formatCount(totals.usersWeek)} joined in the last 7 days`} href="/admin/users" />
      <StatTile label="Pro accounts" value={formatCount(totals.proUsers)} hint={totals.users ? `${Math.round((totals.proUsers / totals.users) * 100)}% of all accounts` : "No accounts yet"} href="/admin/users?filter=pro" />
      <StatTile label="Websites" value={formatCount(totals.sites)} hint={`${formatCount(totals.sitesListed)} listed · ${formatCount(totals.sitesWeek)} new this week`} href="/admin/websites" />
      <StatTile label="Live advertisements" value={formatCount(totals.adsActive)} hint={`${formatCount(totals.adPositions)} positions accept bookings`} href="/admin/ads" />
      <StatTile label="Revenue, last 30 days" value={formatMoney(totals.revenue30d)} hint="Succeeded USD payments" href="/admin/payments" />
      <StatTile label="Revenue, all time" value={formatMoney(totals.revenueTotal)} hint="Succeeded USD payments" href="/admin/payments" />
      <StatTile label="Pending ownership claims" value={formatCount(totals.pendingClaims)} />
      <StatTile label="Failed background jobs" value={formatCount(totals.failedJobs)} hint={totals.failedJobs ? "Check the worker logs" : "Queues are clear"} />
    </div>

    <div className="mt-5 grid gap-5 min-[1100px]:grid-cols-2">
      <Panel title="New accounts" description="Sign-ups per day, last 30 days (UTC)."><DailyColumns data={data.signups} caption="New accounts per day" /></Panel>
      <Panel title="Submitted websites" description="New website records per day, last 30 days (UTC)."><DailyColumns data={data.submissions} caption="Submitted websites per day" /></Panel>
    </div>

    <div className="mt-5 grid gap-5 min-[1100px]:grid-cols-3">
      <Panel title="Revenue" description="Succeeded USD payments per day, last 30 days (UTC)."><DailyColumns data={data.revenue} caption="Revenue per day" format={(value) => formatMoney(value)} /></Panel>
      <Panel title="Score bands" description="Listed websites by their current recorded score."><ScoreBands {...data.scores} /></Panel>
      <Panel title="Website lifecycle" description="Every website record by lifecycle state."><BarList items={data.lifecycle} empty="No websites have been submitted yet." /></Panel>
    </div>

    <div className="mt-5 grid gap-5 min-[1100px]:grid-cols-3">
      <Panel title="Newest users" action={<TextLink href="/admin/users">All users</TextLink>}>
        {data.recentUsers.length ? <ul className="divide-y divide-border">{data.recentUsers.map((user) => <li key={user.id} className="flex items-center gap-3 px-5 py-3">
          <Monogram name={user.name} /><span className="min-w-0 flex-1 truncate text-[0.84rem] font-semibold">{user.name}</span>
          <span className="shrink-0 text-[0.74rem] text-text-secondary">{formatDate(user.createdAt)}</span></li>)}</ul> : <Empty>No accounts yet.</Empty>}
      </Panel>
      <Panel title="Newest websites" action={<TextLink href="/admin/websites">All websites</TextLink>}>
        {data.recentSites.length ? <ul className="divide-y divide-border">{data.recentSites.map((site) => <li key={site.id} className="flex items-center gap-3 px-5 py-3">
          <span className="min-w-0 flex-1"><Link href={`/site/${site.slug}`} className="block truncate text-[0.84rem] font-semibold text-text-primary no-underline hover:text-accent-bright">{site.name}</Link>
            <span className="text-[0.72rem] capitalize text-text-secondary">{site.lifecycle} · {formatDate(site.createdAt)}</span></span>
          {!site.isListed ? <Pill>Unlisted</Pill> : site.score > 0 ? <Pill tone={scoreTone(site.score)}><span className="font-mono">{site.score}</span></Pill> : <Pill>Not tested</Pill>}</li>)}</ul> : <Empty>No websites yet.</Empty>}
      </Panel>
      <Panel title="Latest administrator actions" action={<TextLink href="/admin/audit">Audit log</TextLink>}>
        {data.audit.length ? <ul className="divide-y divide-border">{data.audit.map((entry) => <li key={entry.id} className="px-5 py-3">
          <p className="flex items-center justify-between gap-3"><span className="truncate font-mono text-[0.76rem] font-semibold text-text-primary">{entry.action}</span>
            <span className="shrink-0 text-[0.7rem] text-text-secondary">{formatDateTime(entry.createdAt)}</span></p>
          <p className="mt-1 truncate text-[0.74rem] text-text-secondary">{entry.actorName ?? "Removed account"} · {entry.reason}</p></li>)}</ul> : <Empty>No administrator actions recorded.</Empty>}
      </Panel>
    </div>

    <p className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[12px] border border-border bg-bg-card px-4 py-3 text-[0.78rem] text-text-secondary">
      <span className="font-semibold text-text-primary">System</span>
      <span className="flex items-center gap-2"><Pill tone="green">Reachable</Pill>Database</span>
      <span className="flex items-center gap-2"><Pill tone={data.health.redis === "ready" ? "green" : "orange"}>{words(data.health.redis)}</Pill>Redis queues</span>
    </p>
  </>;
}
