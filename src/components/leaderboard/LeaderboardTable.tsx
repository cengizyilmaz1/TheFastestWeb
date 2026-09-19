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

export function LeaderboardTable({ initialSites }: LeaderboardTableProps) {
  const [allSites, setAllSites] = useState<Site[]>(initialSites);
  const [loading, setLoading] = useState(false);
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
    try {
      const resp = await fetch(`/api/sites?offset=${allSites.length}&limit=20`);
      if (resp.ok) {
        const data = await resp.json();
        setAllSites((prev) => [...prev, ...data.sites]);
        setHasMore(data.hasMore);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-bg-main border border-border rounded-[14px] overflow-hidden mx-5 mb-10">
      <div className="flex items-center justify-between gap-4 px-5 pt-[18px] pb-3.5">
        <div className="font-display font-[800] text-[1.25rem] flex items-center gap-2 shrink-0">
          Leaderboard
        </div>
        <div className="flex gap-2 shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-3 pr-7 py-1.5 rounded-lg bg-bg-card border border-border text-text-primary text-[0.8rem] font-body font-medium cursor-pointer appearance-none bg-[url('data:image/svg+xml,%253Csvg%2520width%3D%252710%2527%2520height%3D%25276%2527%2520viewBox%3D%25270%25200%252010%25206%2527%2520fill%3D%2527none%2527%2520xmlns%3D%2527http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%2527%253E%253Cpath%2520d%3D%2527M1%25201L5%25205L9%25201%2527%2520stroke%3D%2527%2523A89F91%2527%2520stroke-width%3D%25271.5%2527%2520stroke-linecap%3D%2527round%2527%2F%253E%253C%2Fsvg%253E')] bg-no-repeat bg-[right_10px_center] transition-colors hover:border-border-light"
          >
            <option value="score">Speed Score</option>
            <option value="loadtime">Load Time</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[700px] table-fixed">
        <colgroup>
          <col className="w-[46px]" />
          <col className="w-[38%]" />
          <col className="w-[18%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="py-2.5 px-3.5 pl-5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              #
            </th>
            <th className="py-2.5 px-3.5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              Website
            </th>
            <th className="py-2.5 px-3.5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              Built by
            </th>
            <th className="py-2.5 px-3.5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              Score
            </th>
            <th className="py-2.5 px-3.5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              Load Time
            </th>
            <th className="py-2.5 px-3.5 text-left text-[0.72rem] font-semibold text-text-muted uppercase tracking-[0.06em] border-b border-border">
              Trend
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedSites.map((site, i) => (
            <LeaderboardRow key={site.id} site={site} rank={i + 1} />
          ))}
        </tbody>
      </table>
      </div>
      {hasMore && (
        <div className="py-3.5 px-5 text-center border-t border-border">
          <button
            onClick={loadMore}
            disabled={loading}
            className="py-2.5 px-7 rounded-[10px] bg-bg-card border border-border text-text-secondary font-semibold text-[0.82rem] cursor-pointer transition-all duration-200 font-body hover:bg-bg-card-hover hover:text-text-primary hover:border-border-light disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Load More Sites"}
          </button>
        </div>
      )}
    </section>
  );
}
