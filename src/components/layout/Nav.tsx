import Link from "next/link";
import Image from "next/image";
import { UserMenu } from "./UserMenu";
import { MobileMenu } from "./MobileMenu";
import { ThemeToggle } from "./ThemeToggle";
import { siteConfig } from "@/config/site";
import type { User } from "@/db/schema";

export function Nav({ user }: { user: User | null }) {
  return <header className="sticky top-0 z-50 border-b border-border bg-bg-main/95 backdrop-blur-md">
    <nav aria-label="Main navigation" className="mx-auto flex h-[72px] max-w-[1600px] items-center justify-between gap-4 px-5 sm:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 text-text-primary no-underline" aria-label={siteConfig.name + " home"}>
        <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" priority />
        <span className="text-lg font-semibold tracking-[-0.04em] sm:text-xl">{siteConfig.name}</span>
      </Link>
      <div className="hidden items-center gap-1 xl:flex">
        <Link className="nav-link" href="/leaderboard">Rankings</Link>
        <Link className="nav-link" href="/explore">Explore</Link>
        <Link className="nav-link" href="/founders">Founders</Link>
        <Link className="nav-link" href="/blog">Journal</Link>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <Link className="nav-link hidden sm:inline-flex" href="/test">Test a site</Link>
        <Link className="button-primary hidden md:inline-flex" href="/submit">Submit website</Link>
        {user ? <UserMenu userId={user.id} name={user.name} avatarUrl={user.avatarUrl} twitterHandle={user.twitterHandle} isPro={user.isPro} />
          : <Link className="nav-link hidden xl:inline-flex" href="/auth/login">Sign in</Link>}
        <MobileMenu />
      </div>
    </nav>
  </header>;
}
