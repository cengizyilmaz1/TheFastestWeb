"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { SquaresFourIcon, SignOutIcon } from "@phosphor-icons/react";

interface UserMenuProps {
  userId: string;
  name: string;
  avatarUrl: string | null;
  twitterHandle: string | null;
  isPro: boolean;
}

export function UserMenu({ userId, name, avatarUrl, twitterHandle, isPro }: UserMenuProps) {
  void userId;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); }
    }
    document.addEventListener("keydown", handleEscape);
    return () => { document.removeEventListener("mousedown", handleClickOutside); document.removeEventListener("keydown", handleEscape); };
  }, [open]);

  async function handleLogout() {
    await signOut({ callbackUrl: "/" });
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("");

  // Prefer X avatar via unavatar, fallback to Google avatar, then initials
  const displayAvatar = twitterHandle
    ? `/api/avatar/${twitterHandle.replace("@", "")}`
    : avatarUrl;

  return (
    <div className="relative" ref={ref} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <button
        ref={trigger}
        onClick={() => setOpen(!open)}
        aria-label="Account menu"
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 ml-1 px-2 py-1 rounded-full border-none bg-transparent cursor-pointer transition-colors hover:bg-bg-card-hover"
      >
        {displayAvatar ? (
          <Image
            unoptimized
            width={28}
            height={28}
            src={displayAvatar}
            alt={name}
            className="w-7 h-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold text-text-muted">
            {initials}
          </div>
        )}
        <span className="text-[0.82rem] font-medium text-text-secondary max-[768px]:hidden">
          {name.split(" ")[0]}
        </span>
        {isPro && (
          <span className="rounded-full bg-brand px-2 py-1 text-[0.65rem] font-bold leading-none text-on-brand">
            Pro
          </span>
        )}
      </button>

      {open && (
        <div className="animate-modal-in absolute right-0 top-[calc(100%+14px)] z-50 w-[200px] origin-top-right overflow-hidden rounded-2xl border border-border bg-bg-main p-1.5 shadow-pop [&>a]:rounded-xl [&>button]:rounded-xl">
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[0.82rem] text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors"
          >
            <SquaresFourIcon size={18} aria-hidden />
            Dashboard
          </Link>
          <div className="h-px bg-border" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[0.82rem] text-text-secondary w-full border-none bg-transparent cursor-pointer hover:bg-bg-card hover:text-red transition-colors text-left font-body"
          >
            <SignOutIcon size={18} aria-hidden />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
