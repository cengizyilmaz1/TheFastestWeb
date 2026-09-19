import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/admin/access";
import { adminSections, adminSectionSchema, getAdminReport } from "@/modules/admin/queries";
import { AppError } from "@/lib/http/errors";
import AdminActionForm from "./action-form";
import ProductForm from "./product-form";
import InventoryForm from "./inventory-form";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string; cursor?: string }> }) {
  let actor;
  try { actor = await requireAdmin(); } catch (error) { if (error instanceof AppError && [401, 403].includes(error.status)) notFound(); throw error; }
  const query = await searchParams;
  const parsed = adminSectionSchema.safeParse(query.section ?? "sites");
  if (!parsed.success) notFound();
  const report = await getAdminReport(actor, parsed.data, query.cursor);
  const columns = Object.keys(report.rows[0] ?? {});
  const available = actor.role === "admin" ? adminSections : adminSections.filter((section) => ["sites", "founders", "categories", "technologies", "countries", "claims", "badges", "performance"].includes(section));
  return <div className="page-shell"><div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="page-eyebrow">Operations · {actor.role}</p><h1 className="page-title">Administration</h1><p className="mt-3 text-text-secondary">Review evidence, preview a change, then confirm with a reason.</p></div><Link href="/dashboard" className="button-secondary">My dashboard</Link></div>
    <nav aria-label="Admin reports" className="mb-8 flex flex-wrap gap-2">{available.map((section) => <Link key={section} href={`/admin?section=${section}`} aria-current={section === parsed.data ? "page" : undefined} className={`rounded-lg border px-3 py-2 text-xs capitalize no-underline ${section === parsed.data ? "border-text-primary text-text-primary" : "border-border text-text-secondary"}`}>{section.replaceAll("-", " ")}</Link>)}</nav>
    <section aria-label={`${parsed.data} report`} className="rounded-xl border border-border bg-bg-card"><div className="border-b border-border p-5"><h2 className="text-xl font-semibold capitalize">{parsed.data.replaceAll("-", " ")}</h2><p className="mt-1 text-xs text-text-muted">Up to 50 records. Sensitive payloads and recipient addresses are excluded.</p></div>
      {report.rows.length ? <div tabIndex={0} aria-label="Scrollable report" className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Administrative records</caption><thead><tr>{columns.map((column) => <th className="border-b border-border p-3 font-medium text-text-secondary" key={column} scope="col">{column.replaceAll("_", " ")}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr className="border-b border-border/60" key={String((row as Record<string, unknown>).id ?? index)}>{columns.map((column) => <td className="max-w-xs break-words p-3 font-mono" key={column}>{display((row as Record<string, unknown>)[column])}</td>)}</tr>)}</tbody></table></div> : <p className="p-6 text-text-secondary">No records in this report.</p>}
      {report.nextCursor && <div className="p-4"><Link className="button-secondary" href={`/admin?section=${parsed.data}&cursor=${encodeURIComponent(report.nextCursor)}`}>Next 50 records</Link></div>}
    </section>{actor.role === "admin" && parsed.data === "products" ? <ProductForm /> : actor.role === "admin" && parsed.data === "ad-inventory" ? <InventoryForm /> : <AdminActionForm role={actor.role} />}
  </div>;
}
function display(value: unknown) { return value === null || value === undefined ? "—" : typeof value === "object" ? JSON.stringify(value).slice(0, 500) : String(value).slice(0, 500); }
