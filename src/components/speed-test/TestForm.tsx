"use client";

import { useState } from "react";
import Link from "next/link";
import { SpeedGauge } from "./SpeedGauge";
import { MetricCard } from "./MetricCard";
import { getDomain, isValidUrl } from "@/lib/utils";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { PageSpeedPending } from "./PageSpeedPending";

interface TestResult {
  score: number;
  fcp: string;
  lcp: string;
  cls: string;
  tbt: string;
  tti: string;
  si: string;
  fcpScore: number;
  lcpScore: number;
  clsScore: number;
  tbtScore: number;
  ttiScore: number | null;
  siScore: number;
}

export function TestForm() {
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [testedUrl, setTestedUrl] = useState("");
  async function runTest() {
    let testUrl = url.trim();
    if (!testUrl) return;

    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = "https://" + testUrl;
      setUrl(testUrl);
    }

    if (!isValidUrl(testUrl)) {
      setError("Please enter a valid URL (e.g. yoursite.com)");
      return;
    }

    setTesting(true);
    setError("");
    setResult(null);
    setTestedUrl(testUrl);

    try {
      const resp = await fetch(
        `/api/speed-test?url=${encodeURIComponent(testUrl)}`
      );
      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Failed to test site");
      }

      setRawData(data);
      setResult({
        score: data.score,
        fcp: data.fcp,
        lcp: data.lcp,
        cls: data.clsDisplay,
        tbt: data.tbt,
        tti: data.tti,
        si: data.si,
        fcpScore: data.fcpScore ?? 0,
        lcpScore: data.lcpScore ?? 0,
        clsScore: data.clsScore ?? 0,
        tbtScore: data.tbtScore ?? 0,
        ttiScore: data.ttiScore ?? null,
        siScore: data.siScore ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="bg-bg-main border border-border rounded-[14px] py-11 px-9 text-center max-w-[680px] mx-auto my-[50px] mb-10">
      <h2 className="font-display font-[800] text-[1.7rem] mb-2">
        Test Your Website Speed
      </h2>
      <p className="text-text-secondary mb-7 text-[0.95rem]">
        Enter a public website URL for a Google PageSpeed Insights mobile lab test.
      </p>

      {/* URL Input */}
      <div className="max-w-[500px] mx-auto mb-5">
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !testing && runTest()}
            placeholder="https://yoursite.com"
            disabled={testing}
            className="flex-1 px-4 py-3 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.9rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted disabled:opacity-50"
          />
        </div>
        <button
          onClick={runTest}
          disabled={testing || !url.trim()}
          className="w-full mt-3 py-3.5 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.95rem] border-none cursor-pointer font-body transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {testing ? "Analyzing..." : "Test Speed"}
        </button>
      </div>

      {/* Analysis Progress */}
      {testing && (
        <div className="mt-8 animate-fade-in-up">
          {/* Site being tested */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-[10px] bg-bg-elevated overflow-hidden flex items-center justify-center">
              <FaviconImg
                url={testedUrl}
                className="w-full h-full object-contain p-1.5"
              />
            </div>
            <div className="text-left">
              <div className="font-bold text-base">{getDomain(testedUrl)}</div>
              <div className="font-mono text-[0.78rem] text-accent">
                {testedUrl}
              </div>
            </div>
          </div>

          {/* Single progress bar */}
          <div className="max-w-[400px] mx-auto">
            <PageSpeedPending />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="text-red text-[0.82rem] mt-2">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-9 animate-fade-in-up">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-[10px] bg-bg-elevated overflow-hidden flex items-center justify-center">
              <FaviconImg
                url={testedUrl}
                className="w-full h-full object-contain p-1.5"
              />
            </div>
            <div className="text-left">
              <div className="font-bold text-base">{getDomain(testedUrl)}</div>
              <div className="font-mono text-[0.78rem] text-accent">
                {testedUrl}
              </div>
            </div>
          </div>

          <SpeedGauge score={result.score} />
          <p className="text-[0.7rem] text-text-muted mb-4">Mobile lab measurement · Google PageSpeed Insights</p>

          <div className="grid grid-cols-3 gap-2.5 max-w-[480px] mx-auto max-[640px]:grid-cols-2">
            <MetricCard label="FCP" value={result.fcp} score={result.fcpScore} />
            <MetricCard label="LCP" value={result.lcp} score={result.lcpScore} />
            <MetricCard label="CLS" value={result.cls} score={result.clsScore} />
            <MetricCard label="TBT" value={result.tbt} score={result.tbtScore} />
            <MetricCard label="TTI" value={result.tti} score={result.ttiScore} />
            <MetricCard label="SI" value={result.si} score={result.siScore} />
          </div>

          <div className="mt-5 text-center">
            {result.score >= 80 ? (
              <div className="mb-3">
                <p className="text-[0.82rem] text-text-secondary mb-1">
                  Your mobile lab score is <strong className="text-green font-mono">{result.score}/100</strong>.
                </p>
                <p className="text-[0.75rem] text-text-muted">
                  Claim your spot on the leaderboard and get a <strong className="text-text-primary">free backlink</strong>.
                </p>
              </div>
            ) : (
              <p className="text-[0.78rem] text-text-muted mb-3">
                Get listed on the leaderboard and earn a <strong className="text-text-primary">free backlink</strong>.
              </p>
            )}
            <Link
              href="/submit"
              onClick={() => {
                sessionStorage.setItem("tfwSpeedResult", JSON.stringify({
                  testResultId: rawData?.testResultId,
                  expiresAt: rawData?.expiresAt,
                  url: testedUrl,
                  score: result.score,
                  fcp: result.fcp,
                  lcp: result.lcp,
                  cls: result.cls,
                  tbt: result.tbt,
                  tti: result.tti,
                  si: result.si,
                  fcpScore: result.fcpScore,
                  lcpScore: result.lcpScore,
                  clsScore: result.clsScore,
                  tbtScore: result.tbtScore,
                  ttiScore: result.ttiScore,
                  siScore: result.siScore,
                  fcpMs: rawData?.fcpMs ?? 0,
                  lcpMs: rawData?.lcpMs ?? 0,
                  clsRaw: rawData?.cls ?? 0,
                  tbtMs: rawData?.tbtMs ?? 0,
                  ttiMs: rawData?.ttiMs ?? null,
                  siMs: rawData?.siMs ?? 0,
                }));
              }}
              className="inline-flex items-center gap-2 px-5 py-[11px] rounded-[10px] text-[0.9rem] font-semibold bg-gradient-to-br from-accent to-accent-bright text-bg-deep no-underline transition-all duration-200 hover:-translate-y-0.5"
            >
              {result.score >= 80 ? "Claim Your Spot — Free" : "Submit to Leaderboard"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
