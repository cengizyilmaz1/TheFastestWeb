"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListIcon, XIcon } from "@phosphor-icons/react";

const links = [["/leaderboard", "Rankings"], ["/explore", "Explore websites"], ["/founders", "Founders"], ["/test", "Test a site"], ["/submit", "Submit website"], ["/blog", "Journal"], ["/auth/login", "Sign in"]];
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!container.current?.contains(event.target as Node)) setOpen(false); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div ref={container} className="relative xl:hidden" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="icon-button" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>
      {open ? <XIcon size={22} aria-hidden /> : <ListIcon size={22} aria-hidden />}
    </button>
    {open && <div id="mobile-navigation" className="absolute right-0 top-[calc(100%+16px)] w-60 rounded-xl border border-border bg-bg-main p-2 shadow-xl">
      {links.map(([href, label]) => <Link key={href} href={href} className="nav-link flex w-full" onClick={() => setOpen(false)}>{label}</Link>)}
    </div>}
  </div>;
}
