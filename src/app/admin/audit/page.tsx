import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { getStaff, listAudit } from "@/modules/admin/dashboard";
import { adminMetadata, authorizeAdmin } from "../authorize";
import { Empty, formatDate, formatDateTime, Monogram, PageHeader, Pagination, Panel, Pill, TableFrame, td, th } from "../_components/ui";

export const dynamic = "force-dynamic";
export const generateMetadata = () => adminMetadata("Security and audit");

type Props = { searchParams: Promise<{ page?: string }> };
const safeguards = [
  "The administrator role is read from the database on every page and every API request. A revoked role stops working immediately.",
  "Anonymous visitors, ordinary accounts and moderators receive a not found response, so the panel does not reveal that it exists.",
  "Every change needs a written reason, a preview and a signed confirmation that expires after five minutes and cannot be replayed.",
  "Panel responses are never cached or indexed, send no referrer and cannot be framed by another site.",
  "Account emails are masked here. Tokens, checkout links, webhook bodies and provider secrets are never part of a report.",
];

export default async function AdminAuditPage({ searchParams }: Props) {
  const actor = await authorizeAdmin();
  const [entries, staff] = await Promise.all([listAudit(actor, { page: (await searchParams).page }), getStaff(actor)]);

  return <>
    <PageHeader title="Security and audit" description="Who can administer the site, which safeguards protect this panel, and a permanent record of every administrative change." />
    <div className="grid gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Active safeguards" description="Enforced on the server for every request.">
        <ul className="space-y-3 px-5 py-4">{safeguards.map((text) => <li key={text} className="flex gap-3 text-[0.82rem] leading-relaxed text-text-secondary">
          <CheckCircle size={18} weight="fill" aria-hidden="true" className="mt-0.5 shrink-0 text-green" /><span>{text}</span></li>)}</ul>
      </Panel>
      <Panel title="Staff access" description="Roles are granted only through an audited operator command.">
        <ul className="divide-y divide-border">{staff.map((member) => <li key={member.id} className="flex items-center gap-3 px-5 py-3">
          <Monogram name={member.name} /><span className="min-w-0 flex-1"><span className="block truncate text-[0.84rem] font-semibold">{member.name}{member.id === actor.userId && <span className="font-normal text-text-secondary"> (you)</span>}</span>
            <span className="text-[0.72rem] text-text-secondary">Last active {formatDate(member.lastActiveAt).toLowerCase() === "never" ? "not recorded" : formatDate(member.lastActiveAt)}</span></span>
          <Pill tone={member.role === "admin" ? "accent" : "neutral"}>{member.role}</Pill></li>)}</ul>
      </Panel>
    </div>

    <Panel title="Audit log" description="Every administrative change with its reason. Newest first." className="mt-5">
      {entries.rows.length ? <TableFrame label="Audit log table">
        <table className="w-full min-w-[820px] border-collapse"><caption className="sr-only">Administrative audit log</caption>
          <thead><tr className="border-b border-border"><th scope="col" className={th}>When</th><th scope="col" className={th}>Administrator</th><th scope="col" className={th}>Action</th>
            <th scope="col" className={th}>Target</th><th scope="col" className={th}>Reason</th></tr></thead>
          <tbody>{entries.rows.map((entry) => <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-bg-card-hover">
            <td className={`${td} whitespace-nowrap text-text-secondary`}>{formatDateTime(entry.createdAt)}</td>
            <td className={`${td} font-semibold`}>{entry.actorName ?? <span className="font-normal text-text-secondary">Removed account</span>}</td>
            <td className={`${td} whitespace-nowrap font-mono text-[0.76rem]`}>{entry.action}</td>
            <td className={td}><span className="capitalize">{entry.targetType.replace(/_/g, " ")}</span><span className="ml-2 font-mono text-[0.7rem] text-text-secondary" title={entry.targetId}>{entry.targetId.slice(0, 8)}</span></td>
            <td className={`${td} max-w-[340px] break-words text-text-secondary`}>{entry.reason}</td>
          </tr>)}</tbody>
        </table>
      </TableFrame> : <Empty>No administrative changes have been recorded yet.</Empty>}
      <Pagination path="/admin/audit" page={entries.page} pages={entries.pages} total={entries.total} params={{}} noun="entry" plural="entries" />
    </Panel>
  </>;
}
