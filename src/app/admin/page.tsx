import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/admin/access";
import { adminSections, adminSectionSchema, getAdminReport } from "@/modules/admin/queries";
import { AppError } from "@/lib/http/errors";
import { AdminView } from "./view";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ section?: string; cursor?: string }> }) {
  let actor;
  try { actor = await requireAdmin(); } catch (error) { if (error instanceof AppError && [401, 403].includes(error.status)) notFound(); throw error; }
  const query = await searchParams;
  const parsed = adminSectionSchema.safeParse(query.section ?? "sites");
  if (!parsed.success) notFound();
  const report = await getAdminReport(actor, parsed.data, query.cursor);
  const available = actor.role === "admin" ? adminSections : adminSections.filter((section) => ["sites", "founders", "categories", "technologies", "countries", "claims", "badges", "performance"].includes(section));
  return <AdminView role={actor.role} section={parsed.data} available={available} rows={report.rows as Record<string, unknown>[]} nextCursor={report.nextCursor} paged={Boolean(query.cursor)} />;
}
