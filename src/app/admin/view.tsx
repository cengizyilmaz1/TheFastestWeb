import Link from "next/link";
import { ArrowRightIcon, ShieldCheckIcon } from "@phosphor-icons/react/dist/ssr";
import type { AdminSection } from "@/modules/admin/queries";
import AdminActionForm from "./action-form";
import ProductForm from "./product-form";
import InventoryForm from "./inventory-form";

type Row = Record<string, unknown>;

export function AdminView({ role, section, available, rows, nextCursor, paged }: { role: "admin" | "moderator"; section: AdminSection; available: readonly AdminSection[]; rows: Row[]; nextCursor: string | null; paged: boolean }) {
  const columns = Object.keys(rows[0] ?? {});
  return <div className="page-shell mx-auto max-w-[1240px]">
    <header>
      <p className="page-eyebrow">Operations</p>
      <h1 className="page-title mt-4">Administration</h1>
      <div className="mt-6 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <p className="page-description">Review evidence, preview a change, then confirm with a reason.</p>
        <div className="flex flex-wrap items-center gap-3"><span className="inline-flex min-h-11 items-center gap-2 rounded-full bg-bg-card px-4 text-sm font-medium text-text-secondary"><ShieldCheckIcon size={17} aria-hidden /><span>Signed in as <span className="font-semibold text-text-primary">{role}</span></span></span><Link href="/dashboard" className="button-secondary">My dashboard</Link></div>
      </div>
    </header>

    <nav aria-label="Admin reports" className="mt-12 flex flex-wrap gap-2 sm:mt-14">{available.map((item) => <Link key={item} href={`/admin?section=${item}`} aria-current={item === section ? "page" : undefined} className="chip">{sentence(item.replaceAll("-", " "))}</Link>)}</nav>

    <section aria-label={`${section} report`} className="pb-16 pt-12 sm:pb-24 sm:pt-16">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div><h2 className="section-title">{sentence(section.replaceAll("-", " "))}</h2><p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-text-secondary">Up to 50 records. Sensitive payloads and recipient addresses are excluded.</p></div>
        <p className="flex items-baseline gap-2 text-sm text-text-secondary"><span className="stat-value text-3xl font-medium leading-none text-text-primary">{rows.length}</span>{rows.length === 1 ? "record on this page" : "records on this page"}</p>
      </div>
      {rows.length ? <div className="panel overflow-hidden"><div tabIndex={0} aria-label="Scrollable report" className="overflow-x-auto focus-visible:-outline-offset-2"><table className="w-full border-collapse text-left text-[13px]"><caption className="sr-only">Administrative records</caption>
        <thead><tr>{columns.map((column) => <th className="whitespace-nowrap border-b border-border-light px-4 py-3.5 text-xs font-medium text-text-muted first:pl-6 last:pr-6" key={column} scope="col">{sentence(column.replaceAll("_", " "))}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr className="border-b border-border transition-colors last:border-b-0 hover:bg-bg-card" key={String(row.id ?? index)}>{columns.map((column) => <td className={"px-4 py-3 align-top leading-5 first:pl-6 last:pr-6 " + cellClass(row[column])} key={column}>{display(row[column])}</td>)}</tr>)}</tbody>
      </table></div></div>
        : <div className="dot-grid rounded-2xl border border-dashed border-border-light px-6 py-12 sm:px-10"><h3 className="text-lg font-semibold">No records in this report.</h3><p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-text-secondary">{paged ? "There is nothing after this cursor. Return to the first page, or choose another report above." : "Nothing has been recorded here yet. Choose another report above."}</p>{paged && <Link className="button-secondary mt-6" href={`/admin?section=${section}`}>First page of this report</Link>}</div>}
      {nextCursor && <div className="mt-8"><Link className="button-secondary" href={`/admin?section=${section}&cursor=${encodeURIComponent(nextCursor)}`}>Next 50 records <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link></div>}
    </section>

    {role === "admin" && section === "products" ? <ProductForm /> : role === "admin" && section === "ad-inventory" ? <InventoryForm /> : <AdminActionForm role={role} />}
  </div>;
}

function sentence(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

const measured = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d{4}-\d{2}-\d{2}[T ][\d:.+\-Z ]*|-?\d+(?:\.\d+)?)$/i;
/** Identifiers, timestamps and numbers read as instrument values; everything else stays in the text face. */
function cellClass(value: unknown) {
  if (value === null || value === undefined) return "text-text-muted";
  if (typeof value === "number" || typeof value === "bigint" || value instanceof Date || (typeof value === "string" && measured.test(value))) return "stat-value whitespace-nowrap text-xs text-text-primary";
  if (typeof value === "boolean") return value ? "font-medium text-green" : "text-text-muted";
  if (typeof value === "object") return "stat-value min-w-[16rem] max-w-md break-all text-xs text-text-secondary";
  return String(value).length > 48 ? "min-w-[22rem] max-w-md break-words text-text-primary" : "whitespace-nowrap text-text-primary";
}
function display(value: unknown) { return value === null || value === undefined ? "—" : value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value).slice(0, 500); }
