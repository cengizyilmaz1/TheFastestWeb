"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, DeviceMobile, Desktop, LinkSimple, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import type { PerformanceResult } from "@/modules/performance/service";
import { SpeedGauge } from "@/components/speed-test/SpeedGauge";
import { MetricCard } from "@/components/speed-test/MetricCard";
import { PageSpeedPending } from "@/components/speed-test/PageSpeedPending";

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
const method = [["Samples per run", "2"], ["Score", "Arithmetic mean"], ["Source", "PageSpeed Insights lab data"], ["Devices", "Mobile or desktop"], ["Accepts", "Public URLs only"]] as const;

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

  const shown = result && tested ? result : null;
  const rowState = testing ? "pending" : shown ? "measured" : "idle";

  return <div>
    <div className="grid gap-x-20 gap-y-12 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,.7fr)]">
      <form onSubmit={runTest}>
        <label htmlFor="speed-url" className="block text-sm font-semibold">Website address</label>
        <div className="relative mt-3">
          <LinkSimple aria-hidden size={22} className="pointer-events-none absolute left-6 top-8 -translate-y-1/2 text-text-muted" />
          <input id="speed-url" className="form-field h-16 rounded-full pl-14 pr-5 text-[17px]! shadow-panel disabled:opacity-70 sm:pr-[13rem]" inputMode="url" autoComplete="url" placeholder="https://yourwebsite.com" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} required disabled={testing} aria-invalid={error ? true : undefined} aria-describedby={error ? "speed-url-error" : undefined} />
          <button className="button-primary mt-3 min-h-14 w-full px-6 text-[15px]! font-semibold! sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:min-h-12 sm:w-auto" type="submit" disabled={testing || !url.trim()}>{testing ? "Measuring…" : "Run speed test"}{testing ? <SpinnerGap size={18} weight="bold" className="animate-spin" aria-hidden /> : <ArrowRight size={18} weight="bold" aria-hidden />}</button>
        </div>
        {error && <p id="speed-url-error" role="alert" className="mt-4 flex items-start gap-3 rounded-2xl bg-red-dim px-5 py-4 text-sm leading-relaxed text-text-primary"><WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red" aria-hidden />{error}</p>}
        <fieldset className="mt-6">
          <legend className="float-left mr-4 flex min-h-12 items-center text-sm text-text-secondary">Device</legend>
          <div className="inline-flex rounded-full border border-border bg-bg-card p-1">{(["mobile", "desktop"] as const).map((device) => <label key={device} className={`relative inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${strategy === device ? "bg-text-primary text-bg-main" : "text-text-secondary hover:text-text-primary"}`}><input className="sr-only" type="radio" name="device" value={device} checked={strategy === device} disabled={testing} onChange={() => { setStrategy(device); setResult(null); setError(""); }} />{device === "mobile" ? <DeviceMobile size={18} aria-hidden /> : <Desktop size={18} aria-hidden />}{device === "mobile" ? "Mobile" : "Desktop"}</label>)}</div>
        </fieldset>
        <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-text-secondary">Each result combines two Google PageSpeed Insights lab measurements for the selected device. Public URLs only.</p>
      </form>
      <dl className="text-[15px] lg:self-start lg:pt-8">{method.map(([term, value]) => <div key={term} className="flex items-baseline justify-between gap-6 border-t border-border py-3.5 last:border-b"><dt className="text-text-secondary">{term}</dt><dd className={"text-right font-semibold text-text-primary" + (term === "Samples per run" ? " stat-value" : "")}>{value}</dd></div>)}</dl>
    </div>

    {/* The instrument. It stays dark in both themes, like the timing board on the home page. */}
    <section aria-label={shown ? "Speed test results" : "Speed test instrument"} className="relative mt-14 overflow-hidden rounded-[28px] border border-border bg-bg-main text-text-primary shadow-pop sm:mt-20">
      <div aria-hidden className="dot-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" />
      <div className="relative px-5 pb-2 pt-6 sm:px-9 sm:pt-8">
        {testing ? <PageSpeedPending title="Waiting for two complete measurements" target={tested?.url} detail="PageSpeed response times vary. Your result appears when both samples are ready." />
          : shown && tested ? <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
            <div className="min-w-0"><h2 className="[overflow-wrap:anywhere] text-xl font-semibold tracking-[-.03em] sm:text-2xl">{tested.url}</h2><p className="mt-1.5 text-sm text-text-muted">Two samples, arithmetic mean.</p></div>
            <p className="chip shrink-0">{tested.strategy === "mobile" ? <DeviceMobile size={16} aria-hidden /> : <Desktop size={16} aria-hidden />}<span className="first-letter:uppercase">{tested.strategy} lab result</span></p>
          </div>
          : <div><h2 className="text-xl font-semibold tracking-[-.03em] sm:text-2xl">Your result appears here</h2><p className="mt-1.5 text-sm text-text-muted">A score out of 100 and six lab metrics for the device you choose.</p></div>}
        <div className="mt-8 grid items-center gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
          <SpeedGauge score={shown ? shown.score : null} pending={testing} className="mx-auto" />
          <dl className="min-w-0 [&>div:last-child]:border-b-0">{metricDefinitions.map((metric) => <MetricCard key={metric.short} label={metric.short} name={metric.name} description={metric.description} value={shown ? shown[metric.value] : ""} score={shown ? shown[metric.score] : null} state={rowState} />)}</dl>
        </div>
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-x-10 gap-y-2 border-t border-border px-5 py-4 text-[13px] leading-relaxed text-text-muted sm:px-9">
        <p className="max-w-[92ch]">{shown ? `Lighthouse ${shown.lighthouseVersion}. ` : ""}Lab measurements are controlled observations, not field data from your visitors. Network conditions and page changes can affect subsequent runs.</p>
        <Link href="/methodology" className="inline-flex min-h-8 shrink-0 items-center gap-1.5 font-medium text-text-secondary no-underline transition-colors hover:text-text-primary">How we measure <ArrowUpRight size={14} aria-hidden /></Link>
      </div>
    </section>

    {shown && tested && <div className="surface-brand relative mt-8 flex flex-col justify-between gap-8 overflow-hidden rounded-[28px] px-7 py-9 sm:px-12 sm:py-12 lg:flex-row lg:items-end">
      <div><h2 className="max-w-[18ch] text-[clamp(1.75rem,3.4vw,2.75rem)] font-bold leading-[1.02] tracking-[-.045em] font-stretch-[120%]">Give your website a lasting profile.</h2><p className="mt-4 max-w-[52ch] leading-relaxed text-text-secondary">Review its details and both device measurements, then build a history from future tests.</p></div>
      <Link className="button-ink min-h-12 shrink-0 self-start px-6 text-[15px] lg:self-auto" href={`/submit?url=${encodeURIComponent(tested.url)}`}>Submit website <ArrowUpRight size={18} weight="bold" aria-hidden /></Link>
    </div>}
  </div>;
}
