import Link from "next/link";
import Image from "next/image";
import { UserMenu } from "./UserMenu";
import { MobileMenu } from "./MobileMenu";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";
import { CommandPalette, SearchTrigger } from "./CommandPalette";
import { siteConfig } from "@/config/site";
import type { User } from "@/db/schema";

/** Brand and destinations on the left; search, theme and the account on the right. "Submit website" is the bar's one filled action. */
export function Nav({ user }: { user: User | null }) {
  return <header className="site-header sticky top-0 z-50 border-b border-border bg-bg-main/95 backdrop-blur-xl">
    <nav aria-label="Main navigation" className="mx-auto flex h-[76px] max-w-[1440px] items-center gap-2 px-4 sm:px-6 lg:px-8">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 text-text-primary no-underline" aria-label={siteConfig.name + " home"}>
        <Image src="/favicon/favicon-96x96.png" alt="" width={36} height={36} className="h-9 w-9" priority />
        <span className="text-[1.05rem] font-bold tracking-[-0.045em] font-stretch-[112%] max-[379px]:hidden sm:text-lg">{siteConfig.name}</span>
      </Link>
      <span aria-hidden className="mx-1.5 hidden h-6 w-px bg-border xl:block" />
      <NavLinks />
      <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
        <SearchTrigger compact label="Search" className="hidden h-10 w-[196px] items-center gap-2 rounded-xl border border-border bg-bg-deep pl-3.5 pr-2 text-sm text-text-muted transition-colors hover:border-text-muted hover:text-text-primary md:inline-flex xl:max-[1399px]:w-auto xl:max-[1399px]:[&>span:nth-child(2)]:hidden" />
        <SearchTrigger compact label="" className="icon-button md:hidden [&>span]:hidden" />
        <ThemeToggle />
        {!user && <Link className="nav-link hidden lg:inline-flex" href="/auth/login">Sign in</Link>}
        <Link className="button-primary hidden min-h-10 px-4 sm:inline-flex" href="/submit">Submit website</Link>
        {user && <UserMenu userId={user.id} name={user.name} avatarUrl={user.avatarUrl} twitterHandle={user.twitterHandle} isPro={user.isPro} />}
        <MobileMenu signedIn={Boolean(user)} />
      </div>
    </nav>
    <CommandPalette />
  </header>;
}
