"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The primary destinations, directory first. The mobile menu reads the same list so the two can never disagree. */
export const primaryLinks = [
  { href: "/explore", label: "Explore", match: ["/explore", "/categories", "/technologies", "/countries", "/fastest", "/featured", "/site"] },
  { href: "/leaderboard", label: "Rankings", match: ["/leaderboard", "/weekly", "/monthly", "/hall-of-fame"] },
  { href: "/founders", label: "Founders", match: ["/founders", "/profile"] },
  { href: "/compare", label: "Compare", match: ["/compare"] },
  { href: "/test", label: "Test a site", match: ["/test"] },
  { href: "/blog", label: "Journal", match: ["/blog"] },
];

export function isActive(pathname: string, match: string[]) {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/"));
}

export function NavLinks() {
  const pathname = usePathname();
  return <div className="hidden items-center gap-0.5 xl:flex">
    {primaryLinks.map((link) => <Link key={link.href} className="nav-link" href={link.href} aria-current={isActive(pathname, link.match) ? "page" : undefined}>{link.label}</Link>)}
  </div>;
}
