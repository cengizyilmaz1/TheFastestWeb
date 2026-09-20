import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/modules/admin/access";
import { AppError } from "@/lib/http/errors";

/** The panel does not reveal its existence: anonymous visitors, ordinary
 * accounts and moderators all receive not found. Every admin page and its
 * metadata call this; the layout alone is not an authorization boundary
 * because layouts do not re-render on client navigation. */
export const authorizeAdmin = cache(async () => {
  try {
    const actor = await requireAdmin();
    if (actor.role !== "admin") notFound();
    return actor;
  } catch (error) {
    if (error instanceof AppError && [401, 403].includes(error.status)) notFound();
    throw error;
  }
});

export async function adminMetadata(title: string): Promise<Metadata> {
  await authorizeAdmin();
  return { title, robots: { index: false, follow: false }, alternates: { canonical: null }, referrer: "no-referrer" };
}
