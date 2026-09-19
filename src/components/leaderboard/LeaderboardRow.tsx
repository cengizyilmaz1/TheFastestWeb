"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react";
import { Site } from "@/db/schema";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";

interface LeaderboardRowProps {
  site: Site;
  rank: number;
}

const monogram = (name: string) => (name.trim().match(/[\p{L}\p{N}]/u)?.[0] ?? "·").toUpperCase();
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);

function OwnerMark({ site }: { site: Site }) {
  if (site.twitterHandle) {
    return <Image unoptimized width={24} height={24} src={`/api/avatar/${site.twitterHandle.replace("@", "")}`} alt={site.ownerName} className="h-6 w-6 shrink-0 rounded-full object-cover" loading="lazy" fetchPriority="low" />;
  }
  return <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg-card text-[10px] font-bold text-text-secondary shadow-[inset_0_0_0_1px_var(--line)]">{initials(site.ownerName)}</span>;
}

export function LeaderboardRow({ site, rank }: LeaderboardRowProps) {
  const position = String(rank).padStart(2, "0");
  const trend = site.trend ?? 0;
  const TrendIcon = trend >= 0 ? ArrowUpIcon : ArrowDownIcon;

  return (
    <tr className="group border-b border-border transition-colors hover:bg-bg-main">
      <td className="py-4 pr-3">
        {rank === 1 ? <span className="stat-value inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-brand px-1.5 text-[13px] font-semibold text-on-brand">{position}</span>
          : rank <= 3 ? <span className="stat-value inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-bg-card px-1.5 text-[13px] font-semibold text-text-primary shadow-[inset_0_0_0_1px_var(--line-strong)]">{position}</span>
            : <span className="stat-value text-xs text-text-muted">{position}</span>}
      </td>
      <td className="py-4 pr-4">
        <Link href={`/site/${site.slug}`} className="flex min-w-0 items-center gap-3 no-underline">
          <span aria-hidden className="monogram transition-colors group-hover:bg-brand group-hover:text-on-brand">{monogram(site.name)}</span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span className={"truncate font-semibold text-text-primary " + (rank <= 3 ? "text-base" : "text-[15px]")}>{site.name}</span>
              {site.category && site.category !== "other" && <span className="hidden shrink-0 rounded-full bg-bg-card px-2 py-0.5 text-xs font-medium text-text-secondary sm:inline">{site.category}</span>}
            </span>
            <span className="mt-0.5 block truncate text-[13px] text-text-muted">{site.description}</span>
          </span>
        </Link>
      </td>
      <td className="hidden py-4 pr-4 md:table-cell">
        {site.ownerId ? (
          <Link href={`/profile/${site.ownerId}`} className="flex min-h-11 min-w-0 items-center gap-2 text-sm text-text-secondary no-underline transition-colors hover:text-text-primary" onClick={(e) => e.stopPropagation()}>
            <OwnerMark site={site} />
            <span className="truncate">{site.ownerName}</span>
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
            <OwnerMark site={{ ...site, twitterHandle: null }} />
            <span className="truncate">{site.ownerName}</span>
          </span>
        )}
      </td>
      <td className="hidden px-4 py-4 xl:table-cell"><ScoreTicks score={site.currentScore} /></td>
      <td className={"stat-value py-4 text-right font-medium leading-none " + (rank <= 3 ? "text-[28px] " : "text-2xl ") + scoreTone(site.currentScore)}>{site.currentScore}</td>
      <td className="stat-value hidden py-4 pl-4 text-right text-xs text-text-secondary sm:table-cell">{site.currentLoadTime || "—"}</td>
      <td className="hidden py-4 pl-4 text-right sm:table-cell">
        <span className={"stat-value inline-flex items-center gap-1 text-[13px] font-medium " + (trend >= 0 ? "text-green" : "text-red")}>
          <TrendIcon size={13} weight="bold" aria-hidden /><span className="sr-only">{trend >= 0 ? "Up" : "Down"} </span>{Math.abs(trend)}%
        </span>
      </td>
    </tr>
  );
}
