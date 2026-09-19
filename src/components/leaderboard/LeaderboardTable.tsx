"use client";

import { useState, useMemo } from "react";
import { Site } from "@/db/schema";
import { LeaderboardRow } from "./LeaderboardRow";

type SortBy = "score" | "loadtime";

function parseLoadTime(lt: string | null): number {
  if (!lt) return Infinity;
  const match = lt.match(/([\d.]+)\s*s/);
  return match ? parseFloat(match[1]) : Infinity;
}

interface LeaderboardTableProps {
  initialSites: Site[];
}

const sortOptions: [SortBy, string][] = [["score", "Speed score"], ["loadtime", "Load time"]];

export function LeaderboardTable({ initialSites }: LeaderboardTableProps) {
  const [allSites, setAllSites] = useState<Site[]>(initialSites);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hasMore, setHasMore] = useState(initialSites.length >= 20);
  const [sortBy, setSortBy] = useState<SortBy>("score");

  const sortedSites = useMemo(() => {
    const copy = [...allSites];
    if (sortBy === "score") {
      copy.sort((a, b) => b.currentScore - a.currentScore);
    } else {
      copy.sort((a, b) => parseLoadTime(a.currentLoadTime) - parseLoadTime(b.currentLoadTime));
    }
    return copy;
  }, [allSites, sortBy]);

  async function loadMore() {
    setLoading(true);
    setFailed(false);
    try {
      const resp = await fetch(`/api/sites?offset=${allSites.length}&limit=20`);
      if (resp.ok) {
        const data = await resp.json();
        setAllSites((prev) => [...prev, ...data.sites]);
        setHasMore(data.hasMore);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section aria-labelledby="leaderboard-table-title" className="min-w-0 px-5 pb-10 sm:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <h2 id="leaderboard-table-title" className="section-title">Leaderboard.</h2>
        <div role="group" aria-label="Sort websites by" className="inline-flex rounded-full border border-border bg-bg-card p-1">
          {sortOptions.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={sortBy === value} onClick={() => setSortBy(value)}
              className={"inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-[background-color,color,transform] duration-200 active:scale-[.97] " + (sortBy === value ? "bg-text-primary text-bg-main shadow-panel" : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <caption className="sr-only">Websites ranked by {sortBy === "score" ? "speed score" : "load time"}</caption>
        <colgroup>
          <col className="w-11 sm:w-14" />
          <col />
          <col className="hidden w-[18%] md:table-column" />
          <col className="hidden w-[20%] xl:table-column" />
          <col className="w-16 sm:w-24" />
          <col className="hidden w-24 sm:table-column" />
          <col className="hidden w-20 sm:table-column" />
        </colgroup>
        <thead className="border-b border-border-light text-xs text-text-muted">
          <tr>
            <th scope="col" className="py-3 pr-3 font-medium">#</th>
            <th scope="col" className="py-3 pr-4 font-medium">Website</th>
            <th scope="col" className="hidden py-3 pr-4 font-medium md:table-cell">Built by</th>
            <th scope="col" className="hidden px-4 py-3 font-medium xl:table-cell"><span className="sr-only">Score scale</span><span aria-hidden className="stat-value flex justify-between"><span>0</span><span>100</span></span></th>
            <th scope="col" className="py-3 text-right font-medium">Score</th>
            <th scope="col" className="hidden py-3 pl-4 text-right font-medium sm:table-cell">Load time</th>
            <th scope="col" className="hidden py-3 pl-4 text-right font-medium sm:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody>
          {sortedSites.map((site, i) => (
            <LeaderboardRow key={site.id} site={site} rank={i + 1} />
          ))}
        </tbody>
      </table>
      {(hasMore || failed) && (
        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <button type="button" onClick={loadMore} disabled={loading} className="button-secondary">
            {loading ? "Loading more websites" : failed ? "Try again" : "Load more websites"}
          </button>
          <p role="status" className="text-sm text-text-secondary">{failed && !loading ? "More websites could not be loaded. Check your connection and try again." : ""}</p>
        </div>
      )}
    </section>
  );
}
