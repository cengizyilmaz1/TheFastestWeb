import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { siteConfig } from "@/config/site";
import { getDashboard } from "@/modules/dashboard/queries";
import { getOwnFounder } from "@/modules/founders/service";
import { getCatalog } from "@/modules/catalog/service";
import { listAvailableAdInventory } from "@/modules/payments/ads";
import { isPaymentsEnabled } from "@/infrastructure/payments/dodo";
import { listProducts } from "@/modules/payments/service";
import { getNotificationPreferences } from "@/modules/notifications/service";
import { DashboardSignedOut, DashboardView } from "./view";

export const metadata: Metadata = { title: "Your dashboard", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ siteCursor?: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    if (siteConfig.isDemo) return <DashboardSignedOut />;
    redirect("/auth/login?returnTo=%2Fdashboard");
  }
  const { siteCursor } = await searchParams;
  const [data, profile, catalog, preferences, products, adInventory] = await Promise.all([getDashboard(user.id, siteCursor), getOwnFounder(user.id), getCatalog(), getNotificationPreferences(user.id), listProducts(), isPaymentsEnabled() ? listAvailableAdInventory() : Promise.resolve([])]);
  return <DashboardView userName={user.name} data={data} profile={profile} countries={catalog.countries} preferences={preferences} products={products} adInventory={adInventory} siteCursor={siteCursor} />;
}
