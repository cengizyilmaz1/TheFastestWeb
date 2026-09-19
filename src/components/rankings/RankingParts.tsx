import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "@phosphor-icons/react/dist/ssr";
import type { RankingRow } from "@/modules/rankings/service";
import { monogram } from "@/components/directory/WebsiteList";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** A UTC calendar date such as "14 Sep 2026". */
export function utcDate(value: Date | string) {
  const date = new Date(value);
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "2026-W37" reads as "Week 37, 2026"; "2026-08" reads as "August 2026". Unknown keys pass through. */
export function periodLabel(key: string) {
  const week = /^(\d{4})-W(\d{2})$/.exec(key);
  if (week) return `Week ${Number(week[2])}, ${week[1]}`;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return monthFormat.format(new Date(`${key}-01T00:00:00Z`));
  return key;
}

export const snapshotName = (snapshot: Record<string, unknown>) => String(snapshot.name || "Website");
export const snapshotHref = (snapshot: Record<string, unknown>) => `/site/${String(snapshot.slug || "")}`;
export function snapshotHost(snapshot: Record<string, unknown>) {
  try { return new URL(String(snapshot.url || "")).hostname.replace(/^www\./, ""); } catch { return ""; }
}

export const formatLcp = (value: number | null) => value === null ? "—" : `${(value / 1000).toFixed(2)}s`;
export const formatCls = (value: number | null) => value?.toFixed(3) ?? "—";
export const formatTbt = (value: number | null) => value === null ? "—" : `${value}ms`;

/** Pill segmented control made of links. The selected link carries aria-current="page". */
export function Segmented({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <nav aria-label={label} className={"inline-flex max-w-full rounded-full border border-border bg-bg-card p-1 " + className}>{children}</nav>;
}

export function SegmentedLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return <Link href={href} aria-current={current ? "page" : undefined} className={"inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold no-underline transition-[background-color,color,transform] duration-200 active:scale-[.97] sm:px-4 "
    + (current ? "bg-text-primary text-bg-main shadow-panel" : "text-text-secondary hover:bg-bg-card-hover hover:text-text-primary")}>{children}</Link>;
}

/** Score change since the previous eligible measurement, in band colors. Ink only on a brand surface. */
export function Delta({ value, onBrand = false, className = "" }: { value: unknown; onBrand?: boolean; className?: string }) {
  if (typeof value !== "number" || Number.isNaN(value)) return <span className={"text-text-muted " + className}>—</span>;
  if (value === 0) return <span className={"stat-value text-text-muted " + className}>0<span className="sr-only"> points, no change</span></span>;
  const up = value > 0, Icon = up ? ArrowUpIcon : ArrowDownIcon;
  return <span className={"stat-value inline-flex items-center gap-1 font-medium " + (onBrand ? "text-text-primary " : up ? "text-green " : "text-red ") + className}>
    <Icon size={13} weight="bold" aria-hidden /><span className="sr-only">{up ? "Up" : "Down"} </span>{Math.abs(value)}<span className="sr-only"> points</span>
  </span>;
}

function RankMark({ rank, leader }: { rank: number; leader: "row" | "tile" }) {
  const text = String(rank).padStart(2, "0");
  if (rank === 1 && leader === "row") return <span className="stat-value text-lg font-semibold text-text-primary">{text}</span>;
  if (rank === 1) return <span className="stat-value inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-brand px-1.5 text-[13px] font-semibold text-on-brand">{text}</span>;
  if (rank <= 3) return <span className="stat-value inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-bg-card px-1.5 text-[13px] font-semibold text-text-primary shadow-[inset_0_0_0_1px_var(--line-strong)]">{text}</span>;
  return <span className="stat-value text-xs text-text-muted">{text}</span>;
}

/**
 * The timing table. `leader="row"` paints first place as a brand band (the live board);
 * `leader="tile"` keeps it to a brand rank tile (archives, where the winner already has its own panel).
 */
export function RankingTable({ rows, caption, leader = "tile", settle = false, emphasis = "score" }: { rows: RankingRow[]; caption: string; leader?: "row" | "tile"; settle?: boolean; emphasis?: "score" | "change" }) {
  // The live board bleeds past its text column so the leader band has room; archive ledgers sit flush with their headings.
  const bleed = leader === "row";
  const edgeL = bleed ? "pl-3 sm:pl-4 " : "", scoreR = bleed ? "pr-3 sm:pr-4 " : "sm:pr-4 ", lcpR = bleed ? "pr-4 " : "lg:pr-4 ", tbtR = bleed ? "pr-4 " : "";
  const head = "pb-3 font-medium " + (bleed ? "" : "border-b border-border-light ");
  return <div className={"min-w-0 " + (bleed ? "-mx-3 sm:-mx-4" : "")}><table className="w-full table-fixed border-separate border-spacing-0 text-left text-sm">
    <caption className="sr-only">{caption}</caption>
    <colgroup><col className={bleed ? "w-[52px] sm:w-[68px]" : "w-11 sm:w-14"} /><col /><col className="hidden w-[23%] xl:table-column" /><col className="w-[84px] sm:w-24" /><col className="hidden w-20 md:table-column" /><col className="hidden w-20 sm:table-column" /><col className="hidden w-20 lg:table-column" /><col className="hidden w-24 lg:table-column" /></colgroup>
    <thead className="text-xs text-text-muted"><tr>
      <th scope="col" className={head + edgeL}>#</th>
      <th scope="col" className={head}>Website</th>
      <th scope="col" className={head + "hidden px-4 xl:table-cell"}><span className="sr-only">Score scale</span><span aria-hidden className="stat-value flex justify-between"><span>0</span><span>100</span></span></th>
      <th scope="col" className={head + scoreR + "text-right"}>Score</th>
      <th scope="col" className={head + "hidden pr-4 text-right md:table-cell"}><abbr title="Score change since the previous eligible measurement" className="no-underline">Change</abbr></th>
      <th scope="col" className={head + lcpR + "hidden text-right sm:table-cell"}><abbr title="Largest Contentful Paint" className="no-underline">LCP</abbr></th>
      <th scope="col" className={head + "hidden pr-4 text-right lg:table-cell"}><abbr title="Cumulative Layout Shift" className="no-underline">CLS</abbr></th>
      <th scope="col" className={head + tbtR + "hidden text-right lg:table-cell"}><abbr title="Total Blocking Time" className="no-underline">TBT</abbr></th>
    </tr></thead>
    <tbody className={settle ? "board-rows" : undefined}>{rows.map((row, index) => {
      const band = leader === "row" && row.rank === 1, podium = row.rank <= 3;
      const afterBand = leader === "row" && index > 0 && rows[index - 1].rank === 1;
      const cell = "transition-colors duration-200 " + (band ? "bg-brand group-hover:bg-[var(--brand-fill-hover)] " : (bleed ? "border-t group-hover:bg-bg-card " : "border-b group-hover:bg-bg-main ") + (afterBand ? "border-transparent " : "border-border "));
      const pad = band ? "py-5 sm:py-6 " : podium ? "py-5 " : "py-4 ";
      const metric = "stat-value hidden text-right text-xs " + (band ? "font-medium text-text-primary " : "text-text-secondary ");
      const name = snapshotName(row.siteSnapshot), change = row.evidence.improvement;
      const host = snapshotHost(row.siteSnapshot) === name.toLowerCase() ? "" : snapshotHost(row.siteSnapshot);
      return <tr key={row.siteId} style={settle ? { "--row": Math.min(index, 9) } as CSSProperties : undefined} className={"group " + (band ? "surface-brand bg-transparent" : "")}>
        <td className={cell + pad + edgeL + (band ? "rounded-l-2xl" : "")}><RankMark rank={row.rank} leader={leader} /></td>
        <td className={cell + pad + "pr-2"}><Link href={snapshotHref(row.siteSnapshot)} className="flex min-w-0 items-center gap-3 rounded-lg no-underline">
          <span aria-hidden className={"monogram transition-colors " + (band ? "bg-text-primary text-bg-main shadow-none" : "group-hover:bg-brand group-hover:text-on-brand")}>{monogram(name)}</span>
          <span className="min-w-0"><span className={"block truncate font-semibold text-text-primary " + (band ? "text-[17px] tracking-[-.02em] font-stretch-[112%] sm:text-xl" : podium ? "text-base" : "text-[15px]")}>{name}</span>{host && <span className={"mt-0.5 block truncate text-[13px] " + (band ? "text-text-secondary" : "text-text-muted")}>{host}</span>}</span>
        </Link></td>
        <td className={cell + pad + "hidden px-4 xl:table-cell"}><ScoreTicks score={row.score} className={band ? "[--band:var(--ink)]" : ""} /></td>
        <td className={cell + pad + scoreR + "text-right " + (band ? "max-sm:rounded-r-2xl" : "")}>
          <span className={"stat-value block font-medium leading-none " + (band ? "text-[32px] text-text-primary sm:text-[40px]" : (podium ? "text-[28px] sm:text-3xl " : "text-2xl ") + scoreTone(row.score))}>{row.score}</span>
          {emphasis === "change" && typeof change === "number"
            ? <span className="mt-1.5 block text-[11px] md:hidden"><Delta value={change} onBrand={band} /></span>
            : <span className={"stat-value mt-1.5 block text-[11px] sm:hidden " + (band ? "text-text-secondary" : "text-text-muted")}><span className="sr-only">LCP </span>{formatLcp(row.lcpMs)}</span>}
        </td>
        <td className={cell + pad + "hidden pr-4 text-right text-[13px] md:table-cell"}><Delta value={change} onBrand={band} /></td>
        <td className={cell + pad + metric + lcpR + "sm:table-cell " + (band ? "sm:max-lg:rounded-r-2xl" : "")}>{formatLcp(row.lcpMs)}</td>
        <td className={cell + pad + metric + "pr-4 lg:table-cell"}>{formatCls(row.cls)}</td>
        <td className={cell + pad + metric + tbtR + "lg:table-cell " + (band ? "rounded-r-2xl" : "")}>{formatTbt(row.tbtMs)}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}

/** Left-aligned empty or error state for ranking surfaces: what happened, then what to do next. */
export function RankingNotice({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="dot-grid rounded-[28px] border border-dashed border-border-light px-6 pb-8 pt-10 sm:px-10 sm:pb-10 sm:pt-14">
    <h2 className="max-w-[22ch] text-2xl font-semibold leading-[1.1] tracking-[-.035em] font-stretch-[116%] sm:text-[2rem]">{title}</h2>
    <p className="mt-4 max-w-[54ch] leading-relaxed text-text-secondary">{description}</p>
    {children && <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-3">{children}</div>}
    <div aria-hidden className="tick-rule mt-12 opacity-70" />
  </div>;
}
