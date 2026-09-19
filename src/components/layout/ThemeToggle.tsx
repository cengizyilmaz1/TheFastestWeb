"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export const themeInitialization = `try{var t=localStorage.getItem('tfw-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{}`;

export function ThemeToggle() {
  function toggle() {
    const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("tfw-theme", theme); } catch { /* Private browsing may disallow storage. */ }
  }
  return <button type="button" onClick={toggle} className="icon-button" aria-label="Switch light or dark theme" title="Switch theme">
    <SunIcon size={20} aria-hidden className="theme-sun" />
    <MoonIcon size={20} aria-hidden className="theme-moon" />
  </button>;
}
