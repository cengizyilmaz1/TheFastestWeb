import { authorizeAdmin, adminMetadata } from "../authorize";
import { PageHeader, Panel, Empty, StatTile, TableFrame, th, td, formatCount, formatDateTime } from "../_components/ui";
import { DailyColumns } from "../_components/charts";
import { listManagedRedirects } from "@/modules/redirects/admin";
import { RedirectsPanel } from "./redirects-panel";
export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("URL redirects");
export default async function RedirectsPage() {
  const data = await listManagedRedirects(await authorizeAdmin());
  const stats = data.statistics;
  return <>
    <PageHeader title="URL redirects" description="Keep old links working when a public page moves. Preview each change before saving." />
    <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile label="All redirect requests" value={formatCount(stats.total)} hint={`${formatCount(stats.human)} browser requests`} />
      <StatTile label="Today" value={formatCount(stats.today)} hint="Since 00:00 UTC · includes bots" />
      <StatTile label="Last 30 days" value={formatCount(stats.last30Days)} hint="Today and the previous 29 UTC days" />
      <StatTile label="Detected bots" value={formatCount(stats.bot)} hint="All-time automated requests" />
    </div>
    <p className="mb-5 max-w-[900px] text-xs leading-relaxed text-text-secondary">Counts begin with this feature and measure requests that received a redirect, not unique people or verified clicks. Bot detection is an estimate. Prefetches, HEAD requests, private profiles and privacy opt-outs are excluded. No visitor identifiers are stored.</p>
    <div className="mb-5 grid gap-5 lg:grid-cols-2">
      <Panel title="Browser requests" description="Last 30 days · UTC · known automation excluded">
        <DailyColumns data={stats.daily.map(point => ({ day: point.date, value: point.human }))} caption="Daily browser redirect requests" />
      </Panel>
      <Panel title="Detected bot requests" description="Last 30 days · UTC · counted separately">
        <DailyColumns data={stats.daily.map(point => ({ day: point.date, value: point.bot }))} caption="Daily detected bot redirect requests" />
      </Panel>
    </div>
    <RedirectsPanel rules={data.rules.map(rule => ({ id: rule.id, sourcePath: rule.sourcePath, destinationPath: rule.destinationPath,
      statusCode: rule.statusCode, enabled: rule.enabled, version: rule.version, statistics: rule.statistics }))} />
    <Panel title="Founder redirect activity" description="Recorded requests to previous public profile addresses. Legacy /profile/ addresses are masked." className="mt-5">
      {data.founderStatistics.length ? <TableFrame label="Founder redirect request statistics">
        <table className="w-full border-collapse">
          <thead><tr>{["Previous address → current profile", "All requests", "Today", "Last 30 days", "Detected bots", "Last request (UTC)"].map(label => <th scope="col" key={label} className={th}>{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">{data.founderStatistics.map(row => <tr key={`${row.founderId}:${row.sourceType}:${row.sourcePath}`}>
            <th scope="row" className={`${td} min-w-[220px] max-w-[380px] text-left font-normal`}>
              <span className="block break-all text-text-secondary">{row.sourcePath}</span>
              <span className="mt-1 block break-all">→ /founder/{row.username}</span>
            </th>
            <td className={`${td} font-mono`}>{formatCount(row.statistics.total)}</td>
            <td className={`${td} font-mono`}>{formatCount(row.statistics.today)}</td>
            <td className={`${td} font-mono`}>{formatCount(row.statistics.last30Days)}</td>
            <td className={`${td} font-mono`}>{formatCount(row.statistics.bot)}</td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDateTime(row.statistics.lastSeenAt)}</td>
          </tr>)}</tbody>
        </table>
      </TableFrame> : <Empty>No public founder redirects recorded yet.</Empty>}
    </Panel>
    <Panel title="Founder address history" description="Profile aliases resolve directly to the current username. Visibility and ownership protections always apply." className="mt-5">
      {data.aliases.length ? <ul className="divide-y divide-border">{data.aliases.map(alias => <li key={alias.oldUsername} className="flex flex-wrap gap-2 px-5 py-3 text-sm">
        <span className="break-all text-text-secondary">/founder/{alias.oldUsername}</span><span aria-hidden="true">→</span>
        <span className="break-all">/founder/{alias.username}</span><span className="text-text-secondary">301 · {alias.visibility}</span>
      </li>)}</ul> : <Empty>No previous founder usernames yet.</Empty>}
      <p className="border-t border-border p-5 text-xs text-text-secondary">Old /profile/account-ID and /founders/username addresses also redirect automatically. Account owners manage their username from My Profile; these protected routes cannot be overridden by a general redirect.</p>
    </Panel>
  </>;
}
