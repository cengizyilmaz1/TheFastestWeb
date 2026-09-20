"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowBendUpRight, CreditCard, Globe, Megaphone, ShieldCheck, SquaresFour, Users } from "@phosphor-icons/react";

const sections = [
  { href: "/admin", label: "Overview", icon: SquaresFour },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/websites", label: "Websites", icon: Globe },
  { href: "/admin/ads", label: "Advertising", icon: Megaphone },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/redirects", label: "URL redirects", icon: ArrowBendUpRight },
  { href: "/admin/audit", label: "Security and audit", icon: ShieldCheck },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return <nav aria-label="Administration" className="admin-nav">
    <ul className="flex gap-1 min-[1000px]:flex-col">
      {sections.map(({ href, label, icon: Icon }) => {
        const current = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return <li key={href} className="shrink-0"><Link href={href} aria-current={current ? "page" : undefined} prefetch={false}
          className={`flex items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[0.84rem] font-semibold no-underline transition-colors ${current
            ? "bg-accent-glow text-accent-bright" : "text-text-secondary hover:bg-bg-card hover:text-text-primary"}`}>
          <Icon size={17} weight={current ? "fill" : "regular"} aria-hidden="true" />{label}
        </Link></li>;
      })}
    </ul>
  </nav>;
}
