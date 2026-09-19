"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowElbowDownLeftIcon, ArrowRightIcon, MagnifyingGlassIcon, MoonIcon } from "@phosphor-icons/react";

type SiteHit = { slug: string; name: string; tagline: string | null; category: string; score: number | null };
type Item = { id: string; group: string; label: string; hint?: string; href?: string; run?: () => void; site?: SiteHit };

export const OPEN_SEARCH_EVENT = "tfw:open-search";

const destinations: { label: string; hint: string; href: string; words: string }[] = [
  { label: "Explore websites", hint: "The full directory", href: "/explore", words: "explore directory browse websites sites all" },
  { label: "Rankings", hint: "Weekly and monthly races", href: "/leaderboard", words: "rankings leaderboard weekly monthly race competition" },
  { label: "Hall of fame", hint: "Past winners", href: "/hall-of-fame", words: "hall of fame winners archive awards" },
  { label: "Founders", hint: "The people behind the websites", href: "/founders", words: "founders makers people profiles" },
  { label: "Compare websites", hint: "Two websites side by side", href: "/compare", words: "compare versus vs side by side" },
  { label: "Test a site", hint: "Run a PageSpeed measurement", href: "/test", words: "test speed measure pagespeed lighthouse check" },
  { label: "Submit website", hint: "Add yours to the directory", href: "/submit", words: "submit add list website new" },
  { label: "Journal", hint: "Articles on web performance", href: "/blog", words: "journal blog articles writing posts" },
  { label: "How we measure", hint: "Methodology", href: "/methodology", words: "methodology how we measure scoring" },
  { label: "Plans and sponsorship", hint: "Pricing", href: "/pricing", words: "pricing plans sponsorship advertise ads pro" },
  { label: "Dashboard", hint: "Your websites", href: "/dashboard", words: "dashboard account my websites" },
];
const categories: [string, string][] = [["saas", "SaaS"], ["tool", "Tools"], ["directory", "Directories"], ["blog", "Blogs"], ["ecommerce", "E-commerce"], ["portfolio", "Portfolios"], ["other", "Other"]];

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem("tfw-theme", theme); } catch { /* Private browsing may disallow storage. */ }
}

/** Search for the whole product, opened with Ctrl K, Cmd K or "/": websites, categories, pages and a few actions. */
export function CommandPalette() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ query: string; sites: SiteHit[]; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  const show = useCallback(() => { setOpen(true); }, []);
  const close = useCallback(() => { dialog.current?.close(); }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName));
      if ((event.key === "k" || event.key === "K") && (event.metaKey || event.ctrlKey) && !event.altKey) { event.preventDefault(); show(); }
      else if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); show(); }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener(OPEN_SEARCH_EVENT, show); };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    if (element && !element.open) element.showModal();
    input.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/search?q=" + encodeURIComponent(term), { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))
        .then((data: { sites: SiteHit[]; total: number }) => { setHits({ query: term, sites: data.sites, total: data.total }); setFailed(false); })
        .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true); });
    }, term ? 140 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, query]);

  const items = useMemo<Item[]>(() => {
    const term = query.trim().toLowerCase();
    const result: Item[] = [];
    if (term) result.push({ id: "search", group: "Search", label: `Search the directory for “${query.trim()}”`, hint: hits && hits.query === query.trim() ? `${hits.total} ${hits.total === 1 ? "match" : "matches"}` : undefined, href: "/explore?q=" + encodeURIComponent(query.trim()) });
    for (const site of hits?.query === query.trim() ? hits.sites : []) result.push({ id: "site:" + site.slug, group: term ? "Websites" : "Fastest right now", label: site.name, hint: site.tagline ?? undefined, href: "/site/" + site.slug, site });
    for (const [slug, name] of categories) if (!term || name.toLowerCase().includes(term) || slug.includes(term)) result.push({ id: "category:" + slug, group: "Categories", label: name, hint: "Category", href: "/categories/" + slug });
    for (const page of destinations) if (!term || (page.label + " " + page.words).toLowerCase().includes(term)) result.push({ id: "page:" + page.href, group: "Go to", label: page.label, hint: page.hint, href: page.href });
    if (!term || "switch toggle theme dark light mode".includes(term)) result.push({ id: "theme", group: "Actions", label: "Switch light or dark theme", run: toggleTheme });
    return result;
  }, [query, hits]);

  const index = Math.min(active, Math.max(items.length - 1, 0));

  function activate(item: Item | undefined) {
    if (!item) return;
    close();
    if (item.run) item.run(); else if (item.href) router.push(item.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") { event.preventDefault(); move(index + 1 >= items.length ? 0 : index + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(index - 1 < 0 ? items.length - 1 : index - 1); }
    else if (event.key === "Enter") { event.preventDefault(); activate(items[index]); }
  }

  function move(next: number) {
    setActive(next);
    list.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
  }

  if (!open) return null;
  let lastGroup = "";
  return <dialog ref={dialog} aria-label="Search" onClose={() => { setOpen(false); setQuery(""); setActive(0); setHits(null); setFailed(false); }} onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    className="m-0 mx-auto mt-[11vh] w-[min(640px,calc(100vw-24px))] max-w-none overflow-hidden rounded-[26px] border border-border bg-bg-main p-0 text-text-primary shadow-pop backdrop:bg-[color-mix(in_srgb,var(--surface-canvas)_55%,transparent)] backdrop:backdrop-blur-md open:animate-modal-in">
    <div>
      <div className="flex items-center gap-3 border-b border-border px-5">
        <MagnifyingGlassIcon size={20} className="shrink-0 text-text-muted" aria-hidden />
        <input ref={input} type="search" role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={items[index] ? "command-" + index : undefined} aria-label="Search websites, categories and pages" autoComplete="off" spellCheck={false} maxLength={100} value={query} onKeyDown={onKeyDown} onChange={(event) => { setQuery(event.target.value); setActive(0); setFailed(false); }} placeholder="Search websites, categories and pages" className="h-[60px] min-w-0 flex-1 bg-transparent text-[17px] outline-none! placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden" />
        <button type="button" onClick={close} className="kbd shrink-0 cursor-pointer" aria-label="Close search">esc</button>
      </div>
      <div ref={list} id="command-results" role="listbox" aria-label="Results" className="max-h-[min(56vh,460px)] overflow-y-auto overscroll-contain p-2">
        {items.map((item, position) => {
          const heading = item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          const selected = position === index;
          return <div key={item.id}>
            {heading && <p className="px-3 pb-1.5 pt-3 text-xs font-medium text-text-muted first:pt-1.5">{heading}</p>}
            <div id={"command-" + position} data-index={position} role="option" aria-selected={selected} data-category={item.site?.category} onPointerMove={() => { if (!selected) setActive(position); }} onClick={() => activate(item)}
              className={"flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 " + (selected ? "bg-bg-card" : "")}>
              {item.site ? <span aria-hidden className="monogram accent-tile h-9 w-9 rounded-[11px] text-sm">{(item.label.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "·").toUpperCase()}</span>
                : <span aria-hidden className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] bg-bg-card text-text-secondary">{item.id === "search" ? <MagnifyingGlassIcon size={16} /> : item.id === "theme" ? <MoonIcon size={16} /> : <ArrowRightIcon size={16} />}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-[15px] font-medium">{item.label}</span>{item.hint && <span className="block truncate text-[13px] text-text-muted">{item.hint}</span>}</span>
              {item.site && <span className={"stat-value text-lg font-medium " + (item.site.score == null ? "text-text-muted" : item.site.score >= 90 ? "text-green" : item.site.score >= 50 ? "text-orange" : "text-red")}>{item.site.score ?? "—"}</span>}
              {selected && <ArrowElbowDownLeftIcon size={16} className="shrink-0 text-text-muted" aria-hidden />}
            </div>
          </div>;
        })}
        {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-text-secondary">Nothing matches. Try a website name, a category, or a page.</p>}
      </div>
      {failed && <p role="status" className="px-5 py-3 text-[13px] text-text-secondary">Website results are unavailable right now. Pages and categories still work.</p>}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border bg-bg-card/60 px-5 py-2.5 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="kbd">↑</span><span className="kbd">↓</span> Move</span>
        <span className="inline-flex items-center gap-1.5"><span className="kbd">↵</span> Open</span>
        <span className="ml-auto inline-flex items-center gap-1.5"><span className="kbd">Ctrl</span><span className="kbd">K</span> Search anywhere</span>
      </div>
    </div>
  </dialog>;
}

/** A search field look-alike that opens the palette. */
export function SearchTrigger({ className = "", label = "Search", compact = false }: { className?: string; label?: string; compact?: boolean }) {
  return <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))} aria-label="Search, Ctrl K" aria-keyshortcuts="Control+K Meta+K" className={className}>
    <MagnifyingGlassIcon size={compact ? 18 : 20} className="shrink-0 text-text-muted" aria-hidden />
    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    <span aria-hidden className="hidden shrink-0 items-center gap-1 sm:inline-flex"><span className="kbd">Ctrl</span><span className="kbd">K</span></span>
  </button>;
}
