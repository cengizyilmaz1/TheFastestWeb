import Link from "next/link";
import { getAdvertising } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "../authorize";
import { AdOperationsPanel } from "../ad-operations-panel";
import { BarList, DailyColumns } from "../_components/charts";
import { Empty, formatCount, formatDate, formatMoney, PageHeader, Panel, Pill, StatTile, TableFrame, td, th, type Tone } from "../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Advertising");

const statusTone: Record<string, Tone> = { active: "green", pending: "orange", expired: "neutral", cancelled: "neutral", rejected: "red" };

export default async function AdminAdsPage() {
  const actor = await authorizeAdmin();
  const { ads, clicks, summary } = await getAdvertising(actor);

  return <>
    <PageHeader title="Advertising" description="Products that bought a sidebar placement, how they perform, and the review queue for paid creative." />
    <div className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
      <StatTile label="Live advertisements" value={formatCount(summary.live)} hint={`${formatCount(summary.positions)} positions configured`} />
      <StatTile label="Waiting for review" value={formatCount(summary.toReview)} hint={summary.held ? `${formatCount(summary.held)} unpaid ${summary.held === 1 ? "hold" : "holds"} in checkout` : "No unpaid holds"} />
      <StatTile label="Active subscriptions" value={formatCount(summary.subscriptions)} hint={`${formatCount(summary.positionsOpen)} positions accept bookings`} />
      <StatTile label="Ad revenue, last 30 days" value={formatMoney(summary.revenue30d)} hint="Succeeded USD payments" />
    </div>

    <div className="mt-5 grid gap-5 min-[1100px]:grid-cols-2">
      <Panel title="Advertisement clicks" description="All placements per day, last 30 days (UTC)."><DailyColumns data={clicks} caption="Advertisement clicks per day" /></Panel>
      <Panel title="Clicks by product" description="Live placements, last 30 days.">
        <BarList items={ads.filter((ad) => ad.live).map((ad) => ({ label: `${ad.name} (${ad.position} ${ad.orderIndex + 1})`, value: ad.clicks30d })).sort((a, b) => b.value - a.value)} empty="No advertisement is live right now." labelWidth={170} />
      </Panel>
    </div>

    <div className="mt-5">
      <Panel title="Advertised products" description="Every creative record, live placements first.">
        {ads.length ? <TableFrame label="Advertised products table">
          <table className="w-full min-w-[720px] border-collapse"><caption className="sr-only">Advertised products</caption>
            <thead><tr className="border-b border-border"><th scope="col" className={th}>Product</th><th scope="col" className={th}>Placement</th><th scope="col" className={th}>Status</th>
              <th scope="col" className={th}>Clicks, 30 days</th><th scope="col" className={th}>Paid through</th></tr></thead>
            <tbody>{ads.map((ad) => <tr key={ad.id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
              <td className={td}><p className="font-semibold">{ad.siteSlug ? <Link href={`/site/${ad.siteSlug}`} className="text-text-primary no-underline hover:text-accent-bright">{ad.name}</Link> : ad.name}</p>
                <p className="max-w-[300px] truncate text-[0.74rem] text-text-secondary">{ad.tagline}</p>
                <p className="font-mono text-[0.7rem] text-text-secondary">{ad.host}{ad.ownerName ? <span className="font-body"> · {ad.ownerName}</span> : null}</p></td>
              <td className={`${td} whitespace-nowrap capitalize`}>{ad.position} · {ad.orderIndex + 1}</td>
              <td className={td}><div className="flex flex-wrap gap-1.5">{ad.live ? <Pill tone="green">Live</Pill> : <Pill tone={statusTone[ad.status] ?? "neutral"}>{ad.status === "active" ? "Not showing" : ad.status}</Pill>}
                {ad.reservationStatus === "paid" && <Pill tone="orange">Review needed</Pill>}</div></td>
              <td className={`${td} font-mono`}>{formatCount(ad.clicks30d)}<span className="ml-2 font-body text-[0.72rem] text-text-secondary">{formatCount(ad.clicksTotal)} total</span></td>
              <td className={`${td} whitespace-nowrap text-text-secondary`}>{ad.endsAt || ad.expiresAt ? formatDate(ad.endsAt ?? ad.expiresAt) : "No end date"}</td>
            </tr>)}</tbody>
          </table>
        </TableFrame> : <Empty>No product has bought a placement yet.</Empty>}
      </Panel>
    </div>

    <AdOperationsPanel />
  </>;
}
