import type { ReactNode } from "react";
import Link from "next/link";
import { CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";

export type Tone = "green" | "orange" | "red" | "accent" | "neutral";
const tones: Record<Tone, string> = {
  green: "border-green/30 bg-green-dim text-green", orange: "border-orange/30 bg-orange-dim text-orange",
  // The base red fails AA on its own tint; this lighter step passes on every admin surface.
  red: "border-red/30 bg-red-dim text-[#FCA5A5]", accent: "border-accent/30 bg-accent-glow text-accent-bright",
  neutral: "border-border bg-bg-main text-text-secondary",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatDate = (value: string | null) => value ? dateFormat.format(new Date(value)) : "Never";
export const formatDateTime = (value: string | null) => value ? `${dateTimeFormat.format(new Date(value))} UTC` : "Never";
export const formatCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
export function formatMoney(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}
export const words = (value: string) => value.replace(/[._-]+/g, " ");

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0"><h1 className="font-display text-[1.75rem] font-bold tracking-[-0.02em]">{title}</h1>
      <p className="mt-1.5 max-w-[640px] text-[0.86rem] leading-relaxed text-text-secondary">{description}</p></div>
    {children}
  </header>;
}

export function StatTile({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = <><p className="text-[0.76rem] font-medium text-text-secondary">{label}</p>
    <p className="mt-2 font-display text-[1.85rem] font-semibold leading-none tracking-[-0.02em] text-text-primary">{value}</p>
    {hint && <p className="mt-2.5 text-[0.74rem] text-text-secondary">{hint}</p>}</>;
  const frame = "block min-w-0 rounded-[14px] border border-border bg-bg-card p-4.5 no-underline";
  return href ? <Link href={href} className={`${frame} transition-colors hover:border-border-light hover:bg-bg-card-hover`}>{body}</Link> : <div className={frame}>{body}</div>;
}

export function Panel({ title, description, action, children, className = "" }: { title: string; description?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`min-w-0 rounded-[14px] border border-border bg-bg-card ${className}`}>
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
      <div className="min-w-0"><h2 className="font-display text-[1rem] font-bold">{title}</h2>
        {description && <p className="mt-1 text-[0.76rem] leading-relaxed text-text-secondary">{description}</p>}</div>
      {action}
    </div>
    {children}
  </section>;
}

export function Pill({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-[0.7rem] font-semibold capitalize ${tones[tone]}`}>{children}</span>;
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-[0.78rem] font-semibold text-accent-bright underline decoration-accent/40 underline-offset-4 hover:decoration-current">{children}</Link>;
}

/** Native GET form: filters live in the URL and work without client code. */
export function SearchForm({ action, query, placeholder, hidden = {} }: { action: string; query: string; placeholder: string; hidden?: Record<string, string | undefined> }) {
  return <form action={action} method="get" role="search" className="relative w-full max-w-[340px]">
    {Object.entries(hidden).map(([name, value]) => value ? <input key={name} type="hidden" name={name} value={value} /> : null)}
    <label htmlFor="admin-search" className="sr-only">{placeholder}</label>
    <MagnifyingGlass size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary" />
    <input id="admin-search" type="search" name="q" defaultValue={query} maxLength={80} placeholder={placeholder} autoComplete="off"
      className="w-full rounded-[10px] border border-border bg-bg-main py-2.5 pl-10 pr-3 text-[0.84rem] text-text-primary outline-none placeholder:text-text-secondary focus:border-accent" />
  </form>;
}

function href(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
  return query.size ? `${path}?${query}` : path;
}

export function FilterTabs({ path, param = "filter", label = "Filter", current, options, params }: { path: string; param?: string; label?: string; current: string;
  options: readonly (readonly [string, string])[]; params: Record<string, string | undefined> }) {
  return <nav aria-label={label} className="flex flex-wrap gap-1.5">
    {options.map(([value, label], index) => <Link key={value} href={href(path, { ...params, [param]: index === 0 ? undefined : value, page: undefined })}
      aria-current={current === value ? "true" : undefined}
      className={`rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold no-underline transition-colors ${current === value
        ? "border-accent/50 bg-accent-glow text-accent-bright" : "border-border text-text-secondary hover:border-border-light hover:text-text-primary"}`}>{label}</Link>)}
  </nav>;
}

export function Pagination({ path, page, pages, total, params, noun, plural = `${noun}s` }: { path: string; page: number; pages: number; total: number;
  params: Record<string, string | undefined>; noun: string; plural?: string }) {
  const step = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-[0.78rem] font-semibold no-underline";
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 text-[0.78rem] text-text-secondary">
    <p><span className="font-mono text-text-primary">{formatCount(total)}</span> {total === 1 ? noun : plural} · page {Math.min(page, pages)} of {pages}</p>
    <nav aria-label="Pagination" className="flex gap-2">
      {page > 1 ? <Link href={href(path, { ...params, page: page > 2 ? String(page - 1) : undefined })} className={`${step} text-text-primary hover:border-border-light`}><CaretLeft size={13} aria-hidden="true" />Previous</Link>
        : <span aria-disabled="true" className={`${step} opacity-40`}><CaretLeft size={13} aria-hidden="true" />Previous</span>}
      {page < pages ? <Link href={href(path, { ...params, page: String(page + 1) })} className={`${step} text-text-primary hover:border-border-light`}>Next<CaretRight size={13} aria-hidden="true" /></Link>
        : <span aria-disabled="true" className={`${step} opacity-40`}>Next<CaretRight size={13} aria-hidden="true" /></span>}
    </nav>
  </div>;
}

/** Positioned, so visually hidden cell text is clipped by the scroller instead of widening the page. */
export function TableFrame({ label, children }: { label: string; children: ReactNode }) {
  return <div tabIndex={0} role="region" aria-label={label} className="relative overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent">{children}</div>;
}
export const th = "whitespace-nowrap px-5 py-3 text-left text-[0.72rem] font-semibold text-text-secondary";
export const td = "px-5 py-3 align-middle text-[0.82rem]";

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-10 text-center text-[0.84rem] text-text-secondary">{children}</p>;
}

export function Monogram({ name }: { name: string }) {
  return <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-bg-main text-[0.72rem] font-bold text-accent-bright">{(name.trim()[0] ?? "?").toUpperCase()}</span>;
}

export function scoreTone(score: number): Tone { return score >= 90 ? "green" : score >= 50 ? "orange" : "red"; }
