"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListIcon, XIcon } from "@phosphor-icons/react";
import { isActive, primaryLinks } from "./NavLinks";

export function MobileMenu({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return <div ref={container} className="xl:hidden" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="icon-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
      {open ? <XIcon size={22} aria-hidden /> : <ListIcon size={22} aria-hidden />}
    </button>
    {open && <div id="mobile-navigation" className="animate-modal-in absolute inset-x-3 top-[calc(100%+10px)] max-h-[calc(100dvh-10rem)] origin-top overflow-y-auto overscroll-contain rounded-[26px] border border-border bg-bg-main p-3 shadow-pop sm:inset-x-6">
      <ul className="grid gap-0.5">{primaryLinks.map((link) => <li key={link.href}><Link href={link.href} aria-current={isActive(pathname, link.match) ? "page" : undefined} className="nav-link flex min-h-12 w-full px-4 text-base" onClick={() => setOpen(false)}>{link.label}</Link></li>)}</ul>
      <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
        <Link href="/submit" className="button-primary min-h-12" onClick={() => setOpen(false)}>Submit website</Link>
        <Link href={signedIn ? "/dashboard" : "/auth/login"} className="button-secondary min-h-12" onClick={() => setOpen(false)}>{signedIn ? "Dashboard" : "Sign in"}</Link>
      </div>
    </div>}
  </div>;
}
