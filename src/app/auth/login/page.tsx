import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, BrowsersIcon, ChartLineUpIcon, IdentificationBadgeIcon, WarningCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { getEnv } from "@/config/env";
import { siteConfig } from "@/config/site";
import { GoogleLogin } from "@/components/auth/GoogleLogin";
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

const account = [
  { icon: BrowsersIcon, label: "Manage your websites" },
  { icon: ChartLineUpIcon, label: "Track their performance" },
  { icon: IdentificationBadgeIcon, label: "Share your founder profile" },
];

/** The brand side of the split: a dark timing screen, like the home page board, with the wordmark, the needle and the rule. */
function BrandBoard() {
  return <div className="relative flex flex-col justify-between gap-14 overflow-hidden rounded-[28px] border border-border bg-bg-main px-7 pb-8 pt-7 text-text-primary shadow-pop sm:px-10 sm:pb-10 sm:pt-9 lg:min-h-[560px]">
    <div aria-hidden className="dot-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_80%)]" />
    <p className="relative flex items-center gap-2.5 text-lg font-bold tracking-[-0.045em] font-stretch-[118%]"><Image src="/logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />{siteConfig.name}</p>
    <div className="relative">
      <p className="max-w-[12ch] text-[clamp(2.25rem,4.2vw,3.75rem)] font-bold leading-[.98] tracking-[-.05em] font-stretch-[120%]">Your work belongs here.</p>
      <ul className="mt-9 text-[15px] font-medium sm:mt-11">
        {account.map(({ icon: Icon, label }) => <li key={label} className="flex items-center gap-3.5 border-t border-border py-3.5"><Icon size={20} className="flex-none text-text-muted" aria-hidden />{label}</li>)}
      </ul>
      <div aria-hidden className="mt-6">
        <div className="relative -mx-3 h-6 overflow-hidden px-3"><div className="needle-track relative h-full" style={{ "--score": 100 } as CSSProperties}><span className="absolute -right-px top-0 h-full w-[3px] origin-bottom -skew-x-[18deg] rounded-sm bg-brand shadow-[0_0_14px_var(--brand-fill)]" /></div></div>
        <div className="tick-rule" />
      </div>
    </div>
  </div>;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const env = getEnv(), query = await searchParams;
  const available = !!env.AUTH_GOOGLE_ID && !!env.AUTH_GOOGLE_SECRET;
  const callbackUrl = query.returnTo?.startsWith("/") && !query.returnTo.startsWith("//") && !query.returnTo.includes("\\") ? query.returnTo : "/dashboard";
  return <div className="mx-auto grid max-w-[1240px] gap-x-16 gap-y-14 px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
    <div className="flex flex-col justify-center lg:py-8">
      <h1 className="page-title">Welcome back.</h1>
      <p className="page-description mt-6 max-w-[42ch]">Sign in to manage your websites, track their performance and share your founder profile.</p>
      <div className="mt-10 max-w-[400px]">
        {available ? <>
          <GoogleLogin callbackUrl={callbackUrl} />
          {query.error && <p role="alert" className="mt-4 flex items-start gap-2.5 rounded-xl bg-red-dim px-4 py-3 text-sm leading-relaxed text-text-primary"><WarningCircleIcon size={18} weight="fill" className="mt-0.5 flex-none text-red" aria-hidden />Sign-in could not be completed. Use a verified Google account and try again.</p>}
          <p className="mt-6 border-t border-border pt-5 text-[13px] leading-relaxed text-text-muted">By continuing, you agree to our <Link href="/terms" className="font-medium text-text-secondary underline decoration-border-light underline-offset-4 transition-colors hover:text-text-primary hover:decoration-brand">terms</Link> and acknowledge our <Link href="/privacy" className="font-medium text-text-secondary underline decoration-border-light underline-offset-4 transition-colors hover:text-text-primary hover:decoration-brand">privacy information</Link>.</p>
        </> : <div className="border-t border-border-light pt-6">
          <h2 className="text-lg font-semibold tracking-[-.02em]">Sign-in is not available in this preview.</h2>
          <p className="mt-2.5 text-[15px] leading-relaxed text-text-secondary">You can explore the directory and preview the new experience while account access is being prepared.</p>
          <Link href="/explore" className="button-secondary mt-7 min-h-12 px-6 text-[15px]">Explore websites <ArrowRightIcon size={16} weight="bold" aria-hidden /></Link>
        </div>}
      </div>
    </div>
    <BrandBoard />
  </div>;
}
