"use client";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";

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
