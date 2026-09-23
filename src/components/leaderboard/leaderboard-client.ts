import type { LegacyLeaderboardSite } from "@/modules/sites/legacy-view";

export type LeaderboardSort = "score" | "loadtime";
type Page = { sites: LegacyLeaderboardSite[]; hasMore: boolean };
type RequestPage = { sort: LeaderboardSort; offset: number; limit: number; signal: AbortSignal };
type State = Page & { sort: LeaderboardSort; loading: boolean; error: string | null };
const unavailable = "The leaderboard could not be loaded. Please try again.";

export function loadTimeMilliseconds(value?: string | null): number {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s)\s*$/i.exec(value ?? "");
  if (!match) return Infinity;
  const milliseconds = Number(match[1]) * (match[2].toLowerCase() === "s" ? 1000 : 1);
  return Number.isFinite(milliseconds) ? milliseconds : Infinity;
}

function compareTime(a: LegacyLeaderboardSite, b: LegacyLeaderboardSite) {
  const left = loadTimeMilliseconds(a.currentLoadTime), right = loadTimeMilliseconds(b.currentLoadTime);
  return left === right ? 0 : left < right ? -1 : 1;
}

function validSite(value: unknown): value is LegacyLeaderboardSite {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return ["id", "slug", "url", "name", "description"].every((key) => typeof row[key] === "string")
    && typeof row.currentScore === "number" && Number.isFinite(row.currentScore)
    && ["category", "faviconUrl", "currentLoadTime", "ownerId", "ownerName", "ownerAvatarUrl", "ownerUsername"]
      .every((key) => row[key] == null || typeof row[key] === "string")
    && (row.trend == null || typeof row.trend === "number" && Number.isFinite(row.trend));
}

export async function fetchLeaderboardPage({ sort, offset, limit, signal }: RequestPage): Promise<Page> {
  const query = new URLSearchParams({ sort, offset: String(offset), limit: String(limit) });
  const response = await fetch(`/api/sites?${query}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(unavailable);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new Error(unavailable);
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.sites) || !page.sites.every(validSite) || typeof page.hasMore !== "boolean"
    || page.sites.length > limit || page.hasMore && page.sites.length === 0) throw new Error(unavailable);
  return { sites: page.sites, hasMore: page.hasMore };
}

/** One request owns the current order. Late responses can never append to another order. */
export function createLeaderboardController(initial: { sites: LegacyLeaderboardSite[]; hasMore?: boolean; error?: boolean },
  paginated = true, fetchPage = fetchLeaderboardPage) {
  let state: State = { sites: initial.sites, sort: "score", loading: false, error: initial.error ? unavailable : null,
    hasMore: paginated && (initial.hasMore ?? initial.sites.length >= 20) };
  let offset = initial.sites.length;
  let serial = 0;
  let active: AbortController | undefined;
  let failed: { sort: LeaderboardSort; offset: number; replace: boolean } | undefined = initial.error
    ? { sort: "score", offset: 0, replace: true } : undefined;
  const listeners = new Set<() => void>();
  function publish(next: State) { state = next; listeners.forEach((listener) => listener()); }

  async function request(sort: LeaderboardSort, start: number, replace: boolean) {
    const sequence = ++serial;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    failed = { sort, offset: start, replace };
    const timeout = setTimeout(() => controller.abort(), 20_000);
    publish({ ...state, sort, sites: replace ? [] : state.sites, hasMore: replace ? false : state.hasMore, loading: true, error: null });
    try {
      const page = await fetchPage({ sort, offset: start, limit: replace ? 50 : 20, signal: controller.signal });
      if (sequence !== serial) return;
      const seen = new Set(replace ? [] : state.sites.map((site) => site.id));
      const incoming = page.sites.filter((site) => { if (seen.has(site.id)) return false; seen.add(site.id); return true; });
      offset = start + page.sites.length;
      failed = undefined;
      publish({ sites: replace ? incoming : [...state.sites, ...incoming], sort, loading: false, hasMore: page.hasMore, error: null });
    } catch {
      if (sequence !== serial) return;
      failed = { sort, offset: start, replace };
      publish({ ...state, loading: false, error: unavailable });
    } finally {
      clearTimeout(timeout);
      if (sequence === serial) active = undefined;
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    dispose() {
      serial++;
      active?.abort();
      active = undefined;
      // React can preserve this store across an effect teardown/reconnection
      // (StrictMode/Fast Refresh). Leave a retryable snapshot, never a spinner
      // whose request has been cancelled. Do not notify an unmounted view.
      if (state.loading) state = { ...state, loading: false, error: unavailable };
    },
    sort(sort: LeaderboardSort) {
      if (sort === state.sort) return Promise.resolve();
      if (paginated) return request(sort, 0, true);
      const sites = [...initial.sites].sort((a, b) => sort === "score"
        ? b.currentScore - a.currentScore || compareTime(a, b)
        : compareTime(a, b) || b.currentScore - a.currentScore);
      publish({ ...state, sites, sort });
      return Promise.resolve();
    },
    loadMore() {
      if (!paginated || state.loading || !state.hasMore || state.error) return Promise.resolve();
      return request(state.sort, offset, false);
    },
    retry() { return !state.loading && failed ? request(failed.sort, failed.offset, failed.replace) : Promise.resolve(); },
  };
}
