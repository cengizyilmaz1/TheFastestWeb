import Link from "next/link";
import { listWebsites, websiteFilters, type WebsiteFilter } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "../authorize";
import { CategoryEditor } from "./category-editor";
import { findCategory } from "@/modules/catalog/categories";
import { Empty, FilterTabs, formatDate, PageHeader, Pagination, Panel, Pill, scoreTone, SearchForm, TableFrame, td, th, type Tone, words } from "../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Registered websites");

type Props = { searchParams: Promise<{ q?: string; filter?: string; sort?: string; owner?: string; page?: string }> };
const filters = [["all", "All websites"], ["listed", "Listed"], ["unlisted", "Unlisted"], ["pro", "Pro tier"], ["advertised", "Advertising"], ["paused", "Monitoring paused"]] as const;
const sorts = [["newest", "Newest"], ["score", "Highest score"], ["tested", "Recently tested"]] as const;
const lifecycleTone: Record<string, Tone> = { active: "green", verified: "green", submitted: "orange", pending: "orange", redirected: "orange",
  unreachable: "red", parked: "red", suspended: "red", removed: "red", archived: "neutral" };

export default async function AdminWebsitesPage({ searchParams }: Props) {
  const actor = await authorizeAdmin();
  const params = await searchParams;
  const filter: WebsiteFilter = websiteFilters.includes(params.filter as WebsiteFilter) ? params.filter as WebsiteFilter : "all";
  const sort = sorts.some(([value]) => value === params.sort) ? params.sort! : "newest";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const owner = typeof params.owner === "string" && /^[0-9a-f-]{36}$/i.test(params.owner) ? params.owner : undefined;
  const sites = await listWebsites(actor, { q: query, filter, sort, owner, page: params.page });
  const keep = { q: query || undefined, filter: filter === "all" ? undefined : filter, sort: sort === "newest" ? undefined : sort, owner };

  return <>
    <PageHeader title="Registered websites" description="Every product in the directory with its owner, listing state, plan and current recorded score." />
    <Panel title="Websites" action={<SearchForm action="/admin/websites" query={query} placeholder="Search by name, address or slug" hidden={{ filter: keep.filter, sort: keep.sort, owner }} />}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border px-5 py-3">
        <FilterTabs path="/admin/websites" current={filter} options={filters} params={keep} />
        <FilterTabs path="/admin/websites" param="sort" label="Sort order" current={sort} options={sorts} params={keep} />
      </div>
      {owner && <p className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-bg-main px-5 py-2.5 text-[0.78rem] text-text-secondary">
        <span>Showing websites owned by one account{sites.rows[0] ? <>: <span className="font-semibold text-text-primary">{sites.rows[0].ownerName}</span></> : null}.</span>
        <Link href="/admin/websites" className="font-semibold text-accent-bright no-underline hover:underline">Show every website</Link></p>}
      {sites.rows.length ? <TableFrame label="Registered websites table">
        <table className="w-full min-w-[920px] border-collapse"><caption className="sr-only">Registered websites</caption>
          <thead><tr className="border-b border-border"><th scope="col" className={th}>Website</th><th scope="col" className={th}>Owner</th><th scope="col" className={th}>State</th>
            <th scope="col" className={th}>Plan</th><th scope="col" className={th}>Score</th><th scope="col" className={th}>Added</th><th scope="col" className={th}>Last test</th></tr></thead>
          <tbody>{sites.rows.map((site) => <tr key={site.id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
            <td className={td}><Link href={`/site/${site.slug}`} className="font-semibold text-text-primary no-underline hover:text-accent-bright">{site.name}</Link>
              <p className="font-mono text-[0.72rem] text-text-secondary">{site.host} · <span className="font-body">{findCategory(site.category)?.name ?? site.category}</span></p>
              <CategoryEditor siteId={site.id} current={site.category} /></td>
            <td className={td}>{site.ownerId ? <Link href={`/admin/websites?owner=${site.ownerId}`} className="text-text-primary underline decoration-border-light underline-offset-4 hover:text-accent-bright">{site.ownerName}</Link> : <span className="text-text-secondary">{site.ownerName}</span>}</td>
            <td className={td}><div className="flex flex-wrap gap-1.5"><Pill tone={lifecycleTone[site.lifecycle] ?? "neutral"}>{site.lifecycle}</Pill>
              {!site.isListed && <Pill>Unlisted</Pill>}{site.monitoringPaused && <Pill tone="orange">Paused</Pill>}</div></td>
            <td className={td}><div className="flex flex-wrap gap-1.5">{site.tier === "pro" ? <Pill tone="green">Pro</Pill> : <Pill>Free</Pill>}
              {site.advertised && <Pill tone="accent">Advertising</Pill>}{site.tier !== "pro" && site.badgeStatus !== "verified" && <Pill tone="orange">Badge {words(site.badgeStatus)}</Pill>}</div></td>
            <td className={td}>{site.lastTestedAt || site.score > 0 ? <Pill tone={scoreTone(site.score)}><span className="font-mono">{site.score}</span></Pill> : <span className="text-text-secondary">Not tested</span>}</td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDate(site.createdAt)}</td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDate(site.lastTestedAt)}</td>
          </tr>)}</tbody>
        </table>
      </TableFrame> : <Empty>{query || filter !== "all" || owner ? "No websites match these filters." : "No websites have been submitted yet."}</Empty>}
      <Pagination path="/admin/websites" page={sites.page} pages={sites.pages} total={sites.total} params={keep} noun="website" />
    </Panel>
  </>;
}
