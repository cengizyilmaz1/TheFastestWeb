"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, DeviceMobile, Desktop, SpinnerGap } from "@phosphor-icons/react";
import type { PerformanceResult } from "@/modules/performance/service";

type Strategy = "mobile" | "desktop";
type Result = Pick<PerformanceResult, "score" | "fcp" | "lcp" | "clsDisplay" | "tbt" | "tti" | "si" | "fcpScore" | "lcpScore" | "clsScore" | "tbtScore" | "ttiScore" | "siScore" | "sampleCount" | "metricsSource" | "lighthouseVersion">;
const metricDefinitions = [
  { name: "First contentful paint", short: "FCP", value: "fcp", score: "fcpScore", description: "When the first text or image appears." },
  { name: "Largest contentful paint", short: "LCP", value: "lcp", score: "lcpScore", description: "When the main visible content is rendered." },
  { name: "Cumulative layout shift", short: "CLS", value: "clsDisplay", score: "clsScore", description: "How much visible content moves unexpectedly." },
  { name: "Total blocking time", short: "TBT", value: "tbt", score: "tbtScore", description: "Time when long tasks block interaction in this lab run." },
  { name: "Time to interactive", short: "TTI", value: "tti", score: "ttiScore", description: "Shown only when reported by the provider." },
  { name: "Speed index", short: "SI", value: "si", score: "siScore", description: "How quickly the page becomes visually complete." },
] as const;

function readResult(value: unknown): Result {
  if (!value || typeof value !== "object") throw new Error("The measurement response was incomplete. Please try again.");
  const data = value as Record<string, unknown>;
  if (data.sampleCount !== 2 || data.metricsSource !== "lab" || typeof data.score !== "number" || !Number.isFinite(data.score) || data.score < 0 || data.score > 100 ||
    typeof data.lighthouseVersion !== "string" || metricDefinitions.some((metric) => typeof data[metric.value] !== "string" ||
      (data[metric.score] !== null && (typeof data[metric.score] !== "number" || !Number.isFinite(data[metric.score]) || Number(data[metric.score]) < 0 || Number(data[metric.score]) > 1)))) {
    throw new Error("The measurement response was incomplete. Please try again.");
  }
  return data as Result;
}

export function TestForm() {
  const [url, setUrl] = useState(""), [strategy, setStrategy] = useState<Strategy>("mobile");
  const [testing, setTesting] = useState(false), [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null), [tested, setTested] = useState<{ url: string; strategy: Strategy } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function runTest(event: FormEvent) {
    event.preventDefault();
    let target = url.trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;
    try { const parsed = new URL(target); if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) throw new Error(); }
    catch { setError("Enter a public website address, such as https://example.com."); return; }
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setUrl(target); setTesting(true); setError(""); setResult(null); setTested({ url: target, strategy });
    try {
      const response = await fetch(`/api/speed-test?url=${encodeURIComponent(target)}&strategy=${strategy}`, {
        cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(150_000)]),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "The test could not be completed. Please try again.");
      const measured = readResult(data);
      if (!controller.signal.aborted) setResult(measured);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name === "TimeoutError" ? "The measurement took longer than expected. Please try again shortly." : cause instanceof Error ? cause.message : "Testing is temporarily unavailable.");
    } finally { if (!controller.signal.aborted) setTesting(false); }
  }
  return <div>
    <form onSubmit={runTest} className="border-b border-border pb-8">
      <label htmlFor="speed-url" className="mb-2 block text-sm font-medium">Website address</label>
      <div className="flex flex-col gap-3 sm:flex-row"><input id="speed-url" className="form-field min-w-0 flex-1" inputMode="url" autoComplete="url" placeholder="https://yourwebsite.com" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} required disabled={testing} /><button className="button-primary shrink-0" type="submit" disabled={testing || !url.trim()}>{testing ? <SpinnerGap size={19} className="animate-spin" /> : <ArrowRight size={19} />}{testing ? "Measuring…" : "Run speed test"}</button></div>
      <fieldset className="mt-5"><legend className="mb-2 text-xs text-text-muted">Device</legend><div className="flex flex-wrap gap-3">{(["mobile", "desktop"] as const).map((device) => <label key={device} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm ${strategy === device ? "border-accent bg-accent-glow" : "border-border"}`}><input className="accent-accent" type="radio" name="device" value={device} checked={strategy === device} disabled={testing} onChange={() => { setStrategy(device); setResult(null); setError(""); }} />{device === "mobile" ? <DeviceMobile size={18} /> : <Desktop size={18} />}{device === "mobile" ? "Mobile" : "Desktop"}</label>)}</div></fieldset>
      <p className="mt-5 text-sm leading-relaxed text-text-secondary">Each result combines two Google PageSpeed Insights lab measurements for the selected device. Public URLs only.</p>
    </form>
    {error && <p role="alert" className="mt-6 rounded-lg border border-red/30 bg-red-dim p-4 text-sm leading-relaxed">{error}</p>}
    {testing && <div role="status" aria-live="polite" className="py-10"><div className="flex items-center gap-3"><SpinnerGap size={24} className="animate-spin text-accent" /><h2 className="font-medium">Waiting for two complete measurements</h2></div><p className="mt-3 break-all text-sm text-text-secondary">{tested?.url}</p><p className="mt-3 text-sm leading-relaxed text-text-muted">PageSpeed response times vary. Your result appears when both samples are ready.</p></div>}
    {result && tested && <section className="pt-8" aria-label="Speed test results"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end"><div><p className="page-eyebrow">{tested.strategy} lab result</p><h2 className="mt-3 break-all text-lg font-medium">{tested.url}</h2><p className="mt-2 text-sm text-text-muted">Two samples · arithmetic mean</p></div><p className={`shrink-0 font-mono text-6xl tracking-tight ${result.score >= 90 ? "text-green" : result.score >= 50 ? "text-accent" : "text-red"}`}>{result.score}<span className="ml-1 text-lg text-text-muted">/100</span></p></div>
      <dl className="mt-8 grid grid-cols-1 gap-x-8 sm:grid-cols-2">{metricDefinitions.map((metric) => { const rating = result[metric.score]; return <div key={metric.short} className="border-t border-border py-5"><dt className="flex items-center justify-between gap-3 text-sm"><span>{metric.name}</span><span className="font-mono text-xs text-text-muted">{metric.short}</span></dt><dd className={`mt-3 font-mono text-2xl ${rating === null ? "text-text-muted" : rating >= .9 ? "text-green" : rating >= .5 ? "text-accent" : "text-red"}`}>{rating === null ? "Unavailable" : result[metric.value]}</dd><dd className="mt-2 text-xs leading-relaxed text-text-muted">{metric.description}</dd></div>; })}</dl>
      <p className="mt-3 text-xs leading-relaxed text-text-muted">Lighthouse {result.lighthouseVersion}. Lab measurements are controlled observations, not field data from your visitors. Network conditions and page changes can affect subsequent runs.</p>
      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-xl bg-bg-card p-6 sm:flex-row sm:items-center"><div><h3 className="font-medium">Give your website a lasting profile.</h3><p className="mt-1 max-w-md text-sm text-text-secondary">Review its details and both device measurements, then build a history from future tests.</p></div><Link className="button-primary shrink-0" href={`/submit?url=${encodeURIComponent(tested.url)}`}>Add website <ArrowRight size={18} /></Link></div>
    </section>}
  </div>;
}
