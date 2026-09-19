"use client";

import Link from "next/link";
import Image from "next/image";
import { Site } from "@/db/schema";
import { FaviconImg } from "@/components/ui/FaviconImg";

interface LeaderboardRowProps {
  site: Site;
  rank: number;
}

export function LeaderboardRow({ site, rank }: LeaderboardRowProps) {
  let rankDisplay: React.ReactNode = rank;
  let topClass = "";

  if (rank === 1) {
    rankDisplay = <span className="text-[1.1rem]">🥇</span>;
    topClass = "bg-[rgba(245,158,11,0.04)] hover:!bg-[rgba(245,158,11,0.08)]";
  } else if (rank === 2) {
    rankDisplay = <span className="text-[1.1rem]">🥈</span>;
    topClass = "bg-[rgba(192,192,192,0.03)]";
  } else if (rank === 3) {
    rankDisplay = <span className="text-[1.1rem]">🥉</span>;
    topClass = "bg-[rgba(205,127,50,0.03)]";
  }

  const scoreClass =
    site.currentScore >= 97
      ? "text-green"
      : site.currentScore >= 94
        ? "text-accent-bright"
        : "text-orange";

  const trend = site.trend ?? 0;
  const trendClass = trend >= 0 ? "text-green" : "text-red";
  const trendArrow = trend >= 0 ? "↑" : "↓";

  return (
    <tr
      className={`border-b border-[rgba(61,53,41,0.4)] cursor-pointer transition-colors duration-150 hover:bg-bg-card last:border-b-0 ${topClass}`}
    >
      <td className="py-3 px-3.5 pl-5 font-mono font-bold text-[0.82rem] text-text-muted">
        {rankDisplay}
      </td>
      <td className="py-3 px-3.5">
        <Link
          href={`/site/${site.slug}`}
          className="flex items-center gap-2.5 no-underline text-inherit"
        >
          <div className="w-[34px] h-[34px] rounded-lg flex items-center justify-center font-[800] text-[13px] font-display shrink-0 overflow-hidden bg-bg-elevated">
            <FaviconImg
              url={site.url}
              src={site.faviconUrl || undefined}
              alt={site.name}
              className="w-full h-full object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[0.88rem] text-text-primary flex items-center gap-2">
              {site.name}
              {site.category && site.category !== "other" && (
                <span className="text-[0.6rem] font-semibold text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded uppercase tracking-wide">
                  {site.category}
                </span>
              )}
            </div>
            <div className="text-[0.75rem] text-text-muted whitespace-nowrap overflow-hidden text-ellipsis max-w-[240px]">
              {site.description}
            </div>
          </div>
        </Link>
      </td>
      <td className="py-3 px-3.5 max-w-[160px]">
        {site.ownerId ? (
          <Link
            href={`/profile/${site.ownerId}`}
            className="flex items-center gap-2 text-text-secondary text-[0.82rem] no-underline hover:text-text-primary transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {site.twitterHandle ? (
              <Image
                unoptimized
                width={24}
                height={24}
                src={`/api/avatar/${site.twitterHandle.replace("@", "")}`}
                alt={site.ownerName}
                className="w-6 h-6 rounded-full shrink-0 object-cover"
                loading="lazy"
                fetchPriority="low"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0">
                {site.ownerName
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </div>
            )}
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{site.ownerName}</span>
          </Link>
        ) : (
          <div className="flex items-center gap-2 text-text-secondary text-[0.82rem]">
            <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-[10px] font-bold text-text-muted shrink-0">
              {site.ownerName
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <span className="whitespace-nowrap overflow-hidden text-ellipsis">{site.ownerName}</span>
          </div>
        )}
      </td>
      <td className={`py-3 px-3.5 font-mono font-bold text-[0.95rem] ${scoreClass}`}>
        {site.currentScore}
      </td>
      <td className="py-3 px-3.5 font-mono font-medium text-[0.82rem] text-text-secondary">
        {site.currentLoadTime}
      </td>
      <td className="py-3 px-3.5">
        <div
          className={`font-mono font-semibold text-[0.8rem] flex items-center gap-[3px] ${trendClass}`}
        >
          {trendArrow} {Math.abs(trend)}%
        </div>
      </td>
    </tr>
  );
}
