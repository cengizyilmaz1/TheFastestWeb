import Link from "next/link";
import { listUsers, userFilters, type UserFilter } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "../authorize";
import { Empty, FilterTabs, formatDate, Monogram, PageHeader, Pagination, Panel, Pill, SearchForm, TableFrame, td, th } from "../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Registered users");

type Props = { searchParams: Promise<{ q?: string; filter?: string; page?: string }> };
const filters = [["all", "All accounts"], ["pro", "Pro"], ["new", "Joined this week"], ["staff", "Staff"]] as const;

export default async function AdminUsersPage({ searchParams }: Props) {
  const actor = await authorizeAdmin();
  const params = await searchParams;
  const filter: UserFilter = userFilters.includes(params.filter as UserFilter) ? params.filter as UserFilter : "all";
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const users = await listUsers(actor, { q: query, filter, page: params.page });
  const keep = { q: query || undefined, filter: filter === "all" ? undefined : filter };

  return <>
    <PageHeader title="Registered users" description="Every account that has signed in. Email addresses are masked in this panel; search still matches the full address." />
    <Panel title="Accounts" action={<SearchForm action="/admin/users" query={query} placeholder="Search by name or email" hidden={{ filter: keep.filter }} />}>
      <div className="border-b border-border px-5 py-3"><FilterTabs path="/admin/users" current={filter} options={filters} params={keep} /></div>
      {users.rows.length ? <TableFrame label="Registered users table">
        <table className="w-full min-w-[760px] border-collapse"><caption className="sr-only">Registered users, newest first</caption>
          <thead><tr className="border-b border-border"><th scope="col" className={th}>User</th><th scope="col" className={th}>Plan</th><th scope="col" className={th}>Websites</th>
            <th scope="col" className={th}>Joined</th><th scope="col" className={th}>Last active</th></tr></thead>
          <tbody>{users.rows.map((user) => <tr key={user.id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
            <td className={td}><div className="flex items-center gap-3"><Monogram name={user.name} />
              <div className="min-w-0"><p className="flex items-center gap-2 font-semibold">{user.name}{user.role && <Pill tone="accent">{user.role}</Pill>}</p>
                <p className="font-mono text-[0.72rem] text-text-secondary">{user.email}</p></div></div></td>
            <td className={td}>{user.isPro ? <Pill tone="green">Pro</Pill> : <Pill>Free</Pill>}</td>
            <td className={`${td} font-mono`}>{user.siteCount ? <Link href={`/admin/websites?owner=${user.id}`} className="text-text-primary underline decoration-border-light underline-offset-4 hover:text-accent-bright">{user.siteCount}<span className="sr-only"> websites owned by {user.name}</span></Link> : <span className="text-text-secondary">0</span>}</td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDate(user.createdAt)}</td>
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDate(user.lastActiveAt)}</td>
          </tr>)}</tbody>
        </table>
      </TableFrame> : <Empty>{query || filter !== "all" ? "No accounts match these filters." : "No accounts have signed in yet."}</Empty>}
      <Pagination path="/admin/users" page={users.page} pages={users.pages} total={users.total} params={keep} noun="account" />
    </Panel>
  </>;
}
