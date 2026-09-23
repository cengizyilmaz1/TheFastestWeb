export function AutofillDetails({ loading, notice, disabled, onFill }: {
  loading: boolean; notice: string; disabled: boolean; onFill: () => void;
}) {
  return <div className="mb-4 rounded-lg border border-border bg-bg-card px-3 py-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[0.72rem] text-text-secondary">Website name, description, category and country are required.</p>
      <button type="button" disabled={disabled || loading} onClick={onFill}
        className="rounded-md border border-border px-2.5 py-1.5 text-[0.72rem] font-semibold text-accent transition-colors hover:border-accent disabled:cursor-wait disabled:opacity-60">
        {loading ? "Reading website…" : "Auto-fill from website"}
      </button>
    </div>
    <p className="mt-1.5 text-[0.68rem] leading-relaxed text-text-secondary" role="status" aria-live="polite">
      {notice || "We can suggest details from your website. Your edits are kept, and your country stays your choice."}
    </p>
  </div>;
}
