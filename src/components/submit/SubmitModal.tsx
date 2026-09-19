"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ProNudgeModal } from "@/components/submit/ProNudgeModal";
import { SpeedGauge } from "@/components/speed-test/SpeedGauge";
import { MetricCard } from "@/components/speed-test/MetricCard";
import { getFaviconUrl, getDomain, isValidUrl, slugify } from "@/lib/utils";
import { signIn } from "next-auth/react";

interface SubmitModalProps {
  onClose: () => void;
}

interface SpeedResult {
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
  ttiScore: number;
  siScore: number;
}

interface AuthUser {
  name: string;
  email: string;
  avatar: string;
  isPro: boolean;
}

const ANALYSIS_STAGES = [
  "Connecting to speed testing service",
  "Loading page in a real browser",
  "Rendering above-the-fold content",
  "Measuring First Contentful Paint",
  "Measuring Largest Contentful Paint",
  "Analyzing Layout Shift",
  "Calculating Blocking Time",
  "Evaluating Interactivity",
  "Computing Speed Index",
  "Analyzing performance metrics",
  "Computing weighted score",
  "Generating final score",
];

export function SubmitModal({ onClose }: SubmitModalProps) {
  // Auth
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  // Progress
  const [currentStage, setCurrentStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const stageTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Results
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [rawSpeedData, setRawSpeedData] = useState<Record<string, unknown> | null>(null);
  const [siteMeta, setSiteMeta] = useState<{ title: string; description: string; favicon: string } | null>(null);

  // Submit
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [twitter, setTwitter] = useState("");
  const [showOnLeaderboard, setShowOnLeaderboard] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro">("free");
  const [badgeTheme, setBadgeTheme] = useState<"dark" | "light">("dark");
  const [badgeVerified, setBadgeVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  // Check auth on mount via Auth.js session endpoint + Pro status
  useEffect(() => {
    Promise.all([
      fetch("/api/auth/session").then((r) => r.ok ? r.json() : null),
      fetch("/api/me").then((r) => r.ok ? r.json() : null),
    ])
      .then(([sessionData, meData]) => {
        if (sessionData?.user) {
          setAuthUser({
            name: sessionData.user.name || sessionData.user.email?.split("@")[0] || "",
            email: sessionData.user.email || "",
            avatar: sessionData.user.image || "",
            isPro: meData?.isPro ?? false,
          });
        }
        setAuthChecked(true);
      })
      .catch(() => setAuthChecked(true));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  // Progress animation
  useEffect(() => {
    if (!testing) {
      setCurrentStage(0);
      setProgress(0);
      if (stageTimeout.current) clearTimeout(stageTimeout.current);
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }

    let stage = 0;
    setCurrentStage(0);
    setProgress(0);

    function advanceStage() {
      if (stage < ANALYSIS_STAGES.length - 1) {
        stage++;
        setCurrentStage(stage);
        stageTimeout.current = setTimeout(advanceStage, 1500 + Math.random() * 2000);
      }
    }
    stageTimeout.current = setTimeout(advanceStage, 2000);

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 98) return 98;
        const inc =
          prev < 30 ? 1.2 :
          prev < 60 ? 0.8 :
          prev < 85 ? 0.4 :
          prev < 92 ? 0.2 :
          0.05;
        return Math.min(prev + inc, 98);
      });
    }, 200);

    return () => {
      if (stageTimeout.current) clearTimeout(stageTimeout.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [testing]);

  async function signInWithGoogle() {
    await signIn("google", { callbackUrl: "/submit" });
  }

  async function runTest() {
    let testUrl = url.trim();
    if (!testUrl) return;
    if (!testUrl.startsWith("http://") && !testUrl.startsWith("https://")) {
      testUrl = "https://" + testUrl;
      setUrl(testUrl);
    }

    if (!isValidUrl(testUrl)) {
      setTestError("Please enter a valid URL (e.g. yoursite.com)");
      return;
    }

    setTesting(true);
    setTestError("");

    const domain = getDomain(testUrl);
    const favicon = getFaviconUrl(testUrl);

    try {
      const [speedResp, metaResp] = await Promise.all([
        fetch(`/api/speed-test?url=${encodeURIComponent(testUrl)}`),
        fetch(`/api/submit?action=metadata&url=${encodeURIComponent(testUrl)}`),
      ]);

      const speedData = await speedResp.json();
      if (!speedResp.ok) throw new Error(speedData.error || "Speed test failed");

      setProgress(100);
      await new Promise((r) => setTimeout(r, 300));

      setSpeedResult({
        score: speedData.score,
        fcp: speedData.fcp,
        lcp: speedData.lcp,
        cls: speedData.clsDisplay,
        tbt: speedData.tbt,
        tti: speedData.tti,
        si: speedData.si,
        fcpScore: speedData.fcpScore ?? 0,
        lcpScore: speedData.lcpScore ?? 0,
        clsScore: speedData.clsScore ?? 0,
        tbtScore: speedData.tbtScore ?? 0,
        ttiScore: speedData.ttiScore ?? 0,
        siScore: speedData.siScore ?? 0,
      });

      setRawSpeedData({
        score: speedData.score,
        fcp: speedData.fcp,
        lcp: speedData.lcp,
        cls: speedData.clsDisplay,
        tbt: speedData.tbt,
        tti: speedData.tti,
        si: speedData.si,
        fcpMs: speedData.fcpMs ?? 0,
        lcpMs: speedData.lcpMs ?? 0,
        clsRaw: speedData.cls ?? 0,
        tbtMs: speedData.tbtMs ?? 0,
        ttiMs: speedData.ttiMs ?? 0,
        siMs: speedData.siMs ?? 0,
      });

      let title = domain;
      let description = "";
      if (metaResp.ok) {
        const metaData = await metaResp.json();
        if (metaData.title) title = metaData.title.substring(0, 60);
        if (metaData.description) description = metaData.description.substring(0, 200);
      }
      setSiteMeta({ title, description, favicon });
      setName(title);
      setDesc(description);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTesting(false);
    }
  }

  async function handleProCheckout() {
    sessionStorage.setItem("tfwPendingSubmit", JSON.stringify({
      url, name, desc: desc, twitter, showOnLeaderboard,
      speedResult, rawSpeedData,
      siteMeta,
    }));
    const resp = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "pro" }),
    });
    if (resp.status === 401) { window.location.href = "/submit"; return; }
    const data = await resp.json();
    window.location.href = data.url || "/pricing";
  }

  async function handleVerifyAndSubmit() {
    const slug = slugify(name) || slugify(getDomain(url));
    setVerifyError("");

    if (!badgeVerified) {
      setVerifying(true);
      try {
        const fullUrl = url.startsWith("http") ? url : `https://${url}`;
        const resp = await fetch(
          `/api/verify-badge?url=${encodeURIComponent(fullUrl)}&slug=${encodeURIComponent(slug)}`
        );
        const data = await resp.json();
        if (!data.verified) {
          setVerifyError("Badge not found on your site. Paste the embed code and publish, then try again.");
          setVerifying(false);
          return;
        }
        setBadgeVerified(true);
      } catch {
        setVerifyError("Could not check your site. Please try again.");
        setVerifying(false);
        return;
      }
      setVerifying(false);
    }

    await handleSubmit();
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setShowNudge(false);
    setSubmitting(true);
    setSubmitError("");
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    try {
      const resp = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: fullUrl,
          name,
          description: desc,
          twitterHandle: twitter || undefined,
          speedData: rawSpeedData,
          isListed: showOnLeaderboard,
        }),
      });
      if (resp.ok) {
        setSubmitted(true);
      } else {
        const data = await resp.json();
        setSubmitError(data.error || "Something went wrong");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-[8px] flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {showNudge && (
        <ProNudgeModal
          onContinueFree={() => handleSubmit()}
          onClose={() => setShowNudge(false)}
        />
      )}
      <div className="bg-bg-main border border-border rounded-[14px] w-full max-w-[500px] max-h-[90vh] overflow-y-auto animate-modal-in">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-5">
          <div>
            <h2 className="font-display font-[800] text-[1.25rem]">
              {submitted ? "You\u2019re on the leaderboard" : speedResult ? "Your speed results" : "Submit your website"}
            </h2>
            {!speedResult && !submitted && authUser && (
              <p className="text-text-muted text-[0.8rem] mt-1">
                Enter your URL to test speed and get listed.
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-[28px] h-[28px] rounded-lg bg-bg-card border border-border text-text-muted text-sm cursor-pointer flex items-center justify-center shrink-0 transition-all duration-200 hover:bg-bg-card-hover hover:text-text-primary"
          >
            &#10005;
          </button>
        </div>

        <div className="px-6 pt-4 pb-6">
          {/* ── Auth check loading ── */}
          {!authChecked ? (
            <div className="flex justify-center py-8">
              <span className="inline-block w-5 h-5 border-2 border-border border-t-accent rounded-full animate-spin" />
            </div>
          ) : !authUser ? (
            /* ── Not logged in ── */
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center mx-auto mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-text-muted">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="currentColor"/>
                </svg>
              </div>
              <h3 className="font-display font-bold text-[1rem] mb-1">
                Sign in to submit
              </h3>
              <p className="text-text-muted text-[0.78rem] mb-4 max-w-[280px] mx-auto">
                Sign in with Google to link sites to your profile and auto-fill your details.
              </p>
              <button
                onClick={signInWithGoogle}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.85rem] cursor-pointer transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light"
              >
                <svg width="16" height="16" viewBox="0 0 18 18">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
              <p className="text-[0.7rem] text-text-muted mt-3">
                Or{" "}
                <Link href="/submit" onClick={onClose} className="text-accent no-underline hover:underline">
                  go to the submit page
                </Link>
              </p>
            </div>
          ) : submitted ? (
            /* ── Submitted ── */
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full bg-green-dim border border-[rgba(34,197,94,0.2)] flex items-center justify-center mx-auto mb-3">
                <span className="text-green text-xl">&#10003;</span>
              </div>
              <p className="text-text-secondary text-[0.85rem] mb-1">
                <strong>{name}</strong> scored <strong className="text-green font-mono">{speedResult?.score}/100</strong>
              </p>
              <p className="text-[0.75rem] text-text-muted mb-5">
                Daily re-testing and speed trend alerts are now active.
              </p>
              <div className="flex gap-3 justify-center">
                <Link
                  href="/"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-[10px] text-[0.82rem] font-semibold bg-bg-card border border-border text-text-primary no-underline hover:bg-bg-card-hover"
                >
                  View Leaderboard
                </Link>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-[10px] text-[0.82rem] font-semibold bg-gradient-to-br from-accent to-accent-bright text-bg-deep border-none cursor-pointer font-body hover:-translate-y-px"
                >
                  Done
                </button>
              </div>
            </div>
          ) : !speedResult ? (
            <>
              {/* ── Logged in user badge ── */}
              <div className="flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-2 mb-3.5 text-[0.78rem]">
                {authUser.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={authUser.avatar} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-bg-elevated flex items-center justify-center text-[8px] font-bold text-text-muted">
                    {authUser.name.split(" ").map(n => n[0]).join("")}
                  </div>
                )}
                <span className="font-semibold text-text-primary">{authUser.name}</span>
                <span className="text-text-muted">{authUser.email}</span>
              </div>

              {/* ── URL Input ── */}
              <div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !testing && runTest()}
                  placeholder="https://yoursite.com"
                  disabled={testing}
                  className="w-full px-3.5 py-3 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.85rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted disabled:opacity-50"
                />
                <button
                  onClick={runTest}
                  disabled={testing || !url.trim()}
                  className="w-full mt-2.5 py-3 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.9rem] border-none cursor-pointer font-body transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {testing ? "Testing..." : "Test Speed & Continue"}
                </button>
              </div>

              {/* Progress */}
              {testing && (
                <div className="mt-5 animate-fade-in-up">
                  <div className="h-1.5 bg-bg-card rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-accent-bright rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[0.75rem] text-text-secondary">
                      {ANALYSIS_STAGES[currentStage]}...
                    </span>
                    <span className="text-[0.68rem] text-text-muted font-mono">
                      {Math.round(progress)}%
                    </span>
                  </div>
                </div>
              )}

              {testError && (
                <div className="text-red text-[0.82rem] mt-3">{testError}</div>
              )}
            </>
          ) : (
            <>
              {/* ── Results + Form ── */}
              <div className="flex items-center gap-4 mb-4">
                <div className="shrink-0">
                  <SpeedGauge score={speedResult.score} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1.5 mb-5">
                <MetricCard label="FCP" value={speedResult.fcp} score={speedResult.fcpScore} />
                <MetricCard label="LCP" value={speedResult.lcp} score={speedResult.lcpScore} />
                <MetricCard label="CLS" value={speedResult.cls} score={speedResult.clsScore} />
                <MetricCard label="TBT" value={speedResult.tbt} score={speedResult.tbtScore} />
                <MetricCard label="TTI" value={speedResult.tti} score={speedResult.ttiScore} />
                <MetricCard label="SI" value={speedResult.si} score={speedResult.siScore} />
              </div>

              {/* Submit form */}
              <div className="border-t border-border pt-4">
                <h3 className="font-bold text-[0.88rem] mb-3">Add to leaderboard</h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (authUser?.isPro) {
                    handleSubmit();
                  } else if (selectedPlan === "pro") {
                    handleProCheckout();
                  } else {
                    handleVerifyAndSubmit();
                  }
                }}>
                  {/* User badge */}
                  <div className="flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-2 mb-3 text-[0.78rem]">
                    {authUser!.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={authUser!.avatar} alt="" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-bg-elevated flex items-center justify-center text-[8px] font-bold text-text-muted">
                        {authUser!.name.split(" ").map(n => n[0]).join("")}
                      </div>
                    )}
                    <span className="font-medium text-text-primary">{authUser!.name}</span>
                    <span className="text-text-muted">{authUser!.email}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                    <div>
                      <label className="block text-[0.7rem] font-semibold text-text-muted mb-0.5">Website Name</label>
                      <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-2.5 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.8rem] font-body outline-none focus:border-accent" />
                    </div>
                    <div>
                      <label className="block text-[0.7rem] font-semibold text-text-muted mb-0.5">X handle <span className="font-normal">(optional)</span></label>
                      <input type="text" value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="@username" className="w-full px-2.5 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.8rem] font-mono outline-none focus:border-accent placeholder:text-text-muted" />
                    </div>
                  </div>
                  <div className="mb-2.5">
                    <label className="block text-[0.7rem] font-semibold text-text-muted mb-0.5">Description</label>
                    <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What does your site do?" maxLength={200} className="w-full px-2.5 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.8rem] font-body outline-none focus:border-accent placeholder:text-text-muted" />
                  </div>

                  {/* Leaderboard toggle — Pro only */}
                  {authUser?.isPro && (
                    <div className="flex items-center justify-between bg-bg-card border border-border rounded-lg px-3 py-2.5 mb-2.5">
                      <div>
                        <div className="text-[0.78rem] font-medium text-text-primary">Show on leaderboard</div>
                        <div className="text-[0.62rem] text-text-muted">
                          {showOnLeaderboard ? "Visible on public leaderboard" : "Private — only you can see it"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowOnLeaderboard(!showOnLeaderboard)}
                        className={`relative w-9 h-5 rounded-full border-none cursor-pointer transition-colors duration-200 shrink-0 ml-2 ${
                          showOnLeaderboard ? "bg-green" : "bg-bg-elevated"
                        }`}
                      >
                        <span
                          className={`absolute top-[3px] w-3.5 h-3.5 rounded-full bg-white transition-transform duration-200 ${
                            showOnLeaderboard ? "left-[19px]" : "left-[3px]"
                          }`}
                        />
                      </button>
                    </div>
                  )}

                  {/* Plan selector — free users only */}
                  {!authUser?.isPro && (
                    <div className="mb-2.5">
                      <div className="text-[0.7rem] font-semibold text-text-muted mb-1.5">Choose your plan</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => { setSelectedPlan("free"); setBadgeVerified(false); setVerifyError(""); }}
                          className={`text-left p-2.5 rounded-[8px] border transition-all duration-150 cursor-pointer ${
                            selectedPlan === "free"
                              ? "border-accent bg-[rgba(245,158,11,0.06)]"
                              : "border-border bg-bg-card hover:border-border-light"
                          }`}
                        >
                          <div className="text-[0.75rem] font-bold text-text-primary mb-1">Free</div>
                          {[["✓","1 site",false],["✓","Dofollow backlink",false],["✓","Speed alerts",false],["✓","Daily tracking",false],["~","Badge embed required",true],["~","Paused 10d inactive, removed at 30",true]].map(([ic,lb,m]) => (
                            <div key={String(lb)} className={`flex gap-1 text-[0.62rem] mb-0.5 ${m ? "text-text-muted" : "text-text-secondary"}`}>
                              <span className={m ? "text-text-muted" : "text-green"}>{String(ic)}</span><span>{String(lb)}</span>
                            </div>
                          ))}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPlan("pro")}
                          className={`text-left p-2.5 rounded-[8px] border transition-all duration-150 cursor-pointer ${
                            selectedPlan === "pro"
                              ? "border-accent bg-[rgba(245,158,11,0.06)]"
                              : "border-border bg-bg-card hover:border-border-light"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-[0.75rem] font-bold text-text-primary">Pro</div>
                            <div className="text-[0.68rem] font-bold text-accent">$9</div>
                          </div>
                          {[["✓","Unlimited sites"],["✓","Dofollow backlink"],["✓","Speed alerts"],["✓","Priority tracking"],["✓","No badge required"],["✓","Lifetime tracking"]].map(([ic,lb]) => (
                            <div key={String(lb)} className="flex gap-1 text-[0.62rem] text-text-secondary mb-0.5">
                              <span className="text-green">{String(ic)}</span><span>{String(lb)}</span>
                            </div>
                          ))}
                        </button>
                      </div>

                      {selectedPlan === "free" && (() => {
                        const badgeSlug = slugify(name) || slugify(getDomain(url));
                        const domain = getDomain(url);
                        const embedCode = `<a href="https://thefastestweb.site/site/${badgeSlug}" target="_blank" rel="noopener"><img src="https://thefastestweb.site/api/badge/${badgeSlug}?variant=speedometer&theme=${badgeTheme}" alt="Speed Score on TheFastestWeb" width="288" height="80" /></a>`;
                        return (
                          <div className="mt-2 p-2.5 bg-bg-card border border-border rounded-[8px]">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="text-[0.68rem] font-semibold text-text-secondary">Embed badge on your homepage</div>
                              <div className="flex items-center gap-0.5 bg-bg-elevated border border-border rounded-md p-0.5">
                                <button type="button" onClick={() => setBadgeTheme("dark")}
                                  className={`px-2 py-0.5 rounded text-[0.6rem] font-semibold transition-all cursor-pointer border-none ${badgeTheme === "dark" ? "bg-bg-card text-text-primary" : "text-text-muted bg-transparent"}`}>
                                  Dark
                                </button>
                                <button type="button" onClick={() => setBadgeTheme("light")}
                                  className={`px-2 py-0.5 rounded text-[0.6rem] font-semibold transition-all cursor-pointer border-none ${badgeTheme === "light" ? "bg-bg-card text-text-primary" : "text-text-muted bg-transparent"}`}>
                                  Light
                                </button>
                              </div>
                            </div>

                            <div className={`flex justify-center items-center rounded-lg p-3 mb-2 ${badgeTheme === "light" ? "bg-[#f1f5f9]" : "bg-[#070809]"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/badge/${badgeSlug}?preview=${speedResult?.score ?? 0}&domain=${encodeURIComponent(domain)}&variant=speedometer&theme=${badgeTheme}`}
                                alt="Badge preview"
                                width={288}
                                height={80}
                                style={{ maxWidth: "100%" }}
                              />
                            </div>

                            <div className="relative">
                              <code className="block text-[0.58rem] text-text-secondary bg-bg-elevated border border-border rounded-md p-2 pr-12 font-mono break-all leading-relaxed select-all">
                                {embedCode}
                              </code>
                              <button
                                type="button"
                                onClick={() => { try { navigator.clipboard.writeText(embedCode); } catch {} setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                                className={`absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[0.58rem] font-semibold rounded border transition-all cursor-pointer ${copied ? "bg-green/10 border-green/40 text-green" : "bg-bg-elevated border-border text-text-muted hover:text-text-primary"}`}
                              >
                                {copied ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            {badgeVerified && (
                              <div className="flex items-center gap-1 mt-1.5 text-[0.68rem] text-green">
                                <span>&#10003;</span> Badge verified
                              </div>
                            )}
                            {verifyError && (
                              <div className="text-red text-[0.68rem] mt-1.5">{verifyError}</div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {submitError && <div className="text-red text-[0.78rem] mb-2">{submitError}</div>}

                  <button
                    type="submit"
                    disabled={submitting || verifying}
                    className="w-full py-2.5 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.88rem] border-none cursor-pointer font-body transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <><span className="inline-block w-3.5 h-3.5 border-2 border-bg-deep/30 border-t-bg-deep rounded-full animate-spin" />Submitting...</>
                    ) : verifying ? (
                      <><span className="inline-block w-3.5 h-3.5 border-2 border-bg-deep/30 border-t-bg-deep rounded-full animate-spin" />Verifying...</>
                    ) : authUser?.isPro ? (
                      "Submit to Leaderboard"
                    ) : selectedPlan === "pro" ? (
                      "Pay & Submit \u2192"
                    ) : (
                      "Verify & Submit"
                    )}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
