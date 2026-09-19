import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { founders } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

/** Old account URLs disclose identity only after an explicit public founder opt-in. */
export default async function LegacyProfilePage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) notFound();
  const db = getDb();
  if (!db) notFound();
  const [profile] = await db.select({ slug: founders.slug }).from(founders)
    .where(and(eq(founders.userId, userId), eq(founders.visibility, "public"))).limit(1);
  // Temporary redirect: a later privacy change must take effect immediately.
  if (profile) redirect("/founders/" + encodeURIComponent(profile.slug));
  const user = await getCurrentUser();
  if (user?.id === userId) redirect("/dashboard");
  notFound();
}
