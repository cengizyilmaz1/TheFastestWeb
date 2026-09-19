import type { ReactNode } from "react";

// Shared presentation for the three admin forms. No state or behaviour lives here.
export const label = "block text-sm font-medium text-text-primary";
export const field = "form-field mt-2 font-normal!";
export const toggleRow = "flex min-h-[52px] cursor-pointer items-center justify-between gap-5 border-t border-border py-3 text-[15px] font-normal text-text-primary transition-colors last:border-b hover:bg-bg-main has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60";
export const checkbox = "h-5 w-5 flex-none cursor-pointer accent-brand disabled:cursor-not-allowed";
// globals.css resets `font` on every <button> outside a layer, so button type is restated with important utilities.
export const primaryButton = "button-primary text-sm! font-semibold!";
export const secondaryButton = "button-secondary text-sm! font-semibold!";

/** A ledger row: the heading and its rules on the left, the form on the right. */
export function FormSection({ title, children, detail }: { title: string; detail: ReactNode; children: ReactNode }) {
  return <section className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
    <div><h2 className="section-title text-[clamp(1.5rem,2.3vw,2rem)]">{title}</h2><p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-text-secondary">{detail}</p></div>
    <div className="min-w-0">{children}</div>
  </section>;
}

/** The proposed change, shown on the dark timing board before it is confirmed. */
export function PreviewBoard({ value, note }: { value: unknown; note?: string }) {
  return <div className="mt-7 overflow-hidden rounded-2xl border border-border bg-bg-main text-text-primary shadow-pop">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border px-5 py-3.5"><h3 className="flex items-center gap-2.5 text-sm font-semibold"><span aria-hidden className="h-2 w-2 rounded-full bg-brand" />Preview</h3>{note && <p className="text-xs text-text-muted">{note}</p>}</div>
    <pre tabIndex={0} aria-label="Previewed change" className="stat-value max-h-[26rem] overflow-auto px-5 py-4 text-xs leading-relaxed text-text-secondary focus-visible:-outline-offset-2">{JSON.stringify(value, null, 2)}</pre>
  </div>;
}

export function FormStatus({ message, failed }: { message: string; failed: boolean }) {
  return <p role="status" className={`text-sm leading-relaxed ${message ? "mt-5" : ""} ${failed ? "text-red" : "text-text-secondary"}`}>{message}</p>;
}
