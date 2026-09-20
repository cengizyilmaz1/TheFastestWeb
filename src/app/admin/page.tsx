import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/admin/access";
import { AppError } from "@/lib/http/errors";
import { PaymentCatalogPanel } from "./payment-catalog-panel";

export const dynamic = "force-dynamic";

const authorize = cache(async () => {
  try {
    const actor = await requireAdmin();
    if (actor.role !== "admin") notFound();
    return actor;
  } catch (error) {
    if (error instanceof AppError && [401, 403].includes(error.status)) notFound();
    throw error;
  }
});

export async function generateMetadata(): Promise<Metadata> {
  await authorize();
  return { title: "Payment administration", robots: { index: false, follow: false },
    alternates: { canonical: null }, referrer: "no-referrer" };
}

export default async function AdminPage() {
  await authorize();
  return <PaymentCatalogPanel />;
}
