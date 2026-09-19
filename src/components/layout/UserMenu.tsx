"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";

interface UserMenuProps {
  userId: string;
  name: string;
  avatarUrl: string | null;
  twitterHandle: string | null;
  isPro: boolean;
}

export function UserMenu({ userId, name, avatarUrl, twitterHandle, isPro }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 ml-1 px-2 py-1 rounded-lg border-none bg-transparent cursor-pointer transition-all duration-200 hover:bg-bg-card"
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
          <span className="px-1.5 py-px rounded text-[0.55rem] font-bold bg-gradient-to-r from-accent to-accent-bright text-bg-deep uppercase leading-none">
            Pro
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] w-[180px] bg-bg-main border border-border rounded-[10px] shadow-[0_8px_30px_rgba(0,0,0,0.4)] overflow-hidden z-50 animate-fade-in-up">
          <Link
            href={`/profile/${userId}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[0.82rem] text-text-secondary no-underline hover:bg-bg-card hover:text-text-primary transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-text-muted">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="currentColor"/>
            </svg>
            My Profile
          </Link>
          <div className="h-px bg-border" />
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 px-3.5 py-2.5 text-[0.82rem] text-text-secondary w-full border-none bg-transparent cursor-pointer hover:bg-bg-card hover:text-red transition-colors text-left font-body"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-text-muted">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" fill="currentColor"/>
            </svg>
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
