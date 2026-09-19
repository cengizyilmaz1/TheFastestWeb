import type { Metadata } from "next";
import Link from "next/link";
import { getEnv } from "@/config/env";
import { GoogleLogin } from "@/components/auth/GoogleLogin";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const env = getEnv(), query = await searchParams;
  const available = !!env.AUTH_GOOGLE_ID && !!env.AUTH_GOOGLE_SECRET;
  const callbackUrl = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") && !query.returnTo.includes("\\") ? query.returnTo : "/dashboard";
  return <div className="page-shell mx-auto max-w-[560px] py-20"><p className="page-eyebrow mb-4">Your work belongs here</p><h1 className="page-title">Welcome back.</h1><p className="page-description mt-5">Sign in to manage your websites, track their performance and share your founder profile.</p><div className="mt-9 rounded-xl border border-border bg-bg-main p-6">{available ? <><GoogleLogin callbackUrl={callbackUrl} />{query.error && <p role="alert" className="mt-4 text-sm text-red">Sign-in could not be completed. Use a verified Google account and try again.</p>}<p className="mt-4 text-xs leading-relaxed text-text-muted">By continuing, you agree to our <Link href="/terms" className="underline">terms</Link> and acknowledge our <Link href="/privacy" className="underline">privacy information</Link>.</p></> : <><h2 className="text-lg font-medium">Sign-in is not available in this preview.</h2><p className="mt-3 text-sm text-text-secondary">You can explore the directory and preview the new experience while account access is being prepared.</p><Link href="/explore" className="button-secondary mt-5">Explore websites</Link></>}</div></div>;
}
