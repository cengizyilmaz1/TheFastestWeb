export function PageSpeedPending() {
  return (
    <div role="status" aria-live="polite" className="text-center">
      <div className="h-1.5 rounded-full bg-accent/20 motion-safe:animate-pulse" aria-hidden="true" />
      <p className="text-[0.78rem] text-text-secondary mt-3">Waiting for PageSpeed measurement…</p>
      <p className="text-[0.7rem] text-text-muted mt-2">One mobile lab test from Google PageSpeed Insights. Results may take a minute.</p>
    </div>
  );
}
