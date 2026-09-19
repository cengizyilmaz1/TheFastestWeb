import type { Metadata } from "next";
import { z } from "zod";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ClaimForm } from "@/components/claims/ClaimForm";
export const metadata: Metadata = { title: "Claim a website", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  const siteId = z.uuid().safeParse((await searchParams).site), user = await getCurrentUser();
  return <div className="page-shell mx-auto max-w-[720px]"><p className="page-eyebrow mb-4">Your website, your profile</p><h1 className="page-title">Verify domain control.</h1><p className="page-description mt-5">Add a DNS record or a verification file to show that you control this website. Existing ownership requires a review before it can change.</p>
    {!siteId.success ? <p className="mt-8 text-sm text-text-secondary">Open a website report and select “Is this your website?” to get started.</p> : !user ? <Link className="button-primary mt-8" href={`/auth/login?returnTo=${encodeURIComponent(`/claim?site=${siteId.data}`)}`}>Sign in to continue</Link> : <ClaimForm siteId={siteId.data} />}
  </div>;
}
