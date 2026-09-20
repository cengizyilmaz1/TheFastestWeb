import Link from "next/link";
import { SubmitButton } from "@/components/submit/SubmitButton";
import { UserMenu } from "@/components/layout/UserMenu";
import { MobileMenu } from "@/components/layout/MobileMenu";
import type { User } from "@/db/schema";
import { getOwnFounderPath } from "@/modules/founders/usernames";

interface NavProps {
  user: User | null;
  canManagePayments?: boolean;
}

export async function Nav({ user, canManagePayments = false }: NavProps) {
  const profileHref = user ? await getOwnFounderPath(user.id) : undefined;
  return (
    <nav className="site-nav fixed top-0 left-[190px] right-[190px] z-[100] bg-[rgba(17,15,13,0.88)] backdrop-blur-[20px] border-b border-border px-6 h-[60px] flex items-center justify-between max-[1100px]:left-0 max-[1100px]:right-0 max-[768px]:px-4">
      <Link href="/" className="flex items-center gap-2 no-underline shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="TheFastestWeb" className="w-8 h-8 object-contain" />
        <span className="font-display font-[800] text-[1.15rem] text-text-primary tracking-[-0.02em]">
          TheFastestWeb
        </span>
      </Link>
      {/* Desktop nav */}
      <div className="flex items-center gap-2 max-[768px]:hidden">
        <Link
          href="/"
          className="px-3.5 py-[7px] rounded-lg text-[0.875rem] font-medium text-text-secondary no-underline transition-all duration-200 hover:text-text-primary hover:bg-bg-card"
        >
          Leaderboard
        </Link>
        <Link
          href="/test"
          className="px-3.5 py-[7px] rounded-lg text-[0.875rem] font-medium text-text-secondary no-underline transition-all duration-200 hover:text-text-primary hover:bg-bg-card"
        >
          Test Speed
        </Link>
        <Link
          href="/pricing"
          className="px-3.5 py-[7px] rounded-lg text-[0.875rem] font-medium text-text-secondary no-underline transition-all duration-200 hover:text-text-primary hover:bg-bg-card"
        >
          Pricing
        </Link>
        <SubmitButton />
        {user ? (
          <UserMenu
            userId={user.id}
            profileHref={profileHref}
            name={user.name}
            avatarUrl={user.avatarUrl}
            twitterHandle={user.twitterHandle}
            isPro={user.isPro}
            canManagePayments={canManagePayments}
          />
        ) : (
          <Link
            href="/submit"
            className="ml-1 px-3.5 py-[7px] rounded-lg text-[0.875rem] font-medium text-text-secondary no-underline transition-all duration-200 hover:text-text-primary hover:bg-bg-card"
          >
            Sign In
          </Link>
        )}
      </div>
      {/* Mobile nav */}
      <div className="flex items-center gap-2 min-[769px]:hidden">
        {user ? (
          <UserMenu
            userId={user.id}
            profileHref={profileHref}
            name={user.name}
            avatarUrl={user.avatarUrl}
            twitterHandle={user.twitterHandle}
            isPro={user.isPro}
            canManagePayments={canManagePayments}
          />
        ) : (
          <Link
            href="/submit"
            className="px-3 py-[6px] rounded-lg text-[0.82rem] font-medium text-text-secondary no-underline transition-all duration-200 hover:text-text-primary hover:bg-bg-card"
          >
            Sign In
          </Link>
        )}
        <MobileMenu />
      </div>
    </nav>
  );
}
