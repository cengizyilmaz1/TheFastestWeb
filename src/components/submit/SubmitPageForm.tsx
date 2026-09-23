"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SpeedGauge } from "@/components/speed-test/SpeedGauge";
import { MetricCard } from "@/components/speed-test/MetricCard";
import { getFaviconUrl, getDomain, isValidUrl, slugify } from "@/lib/utils";
import { FaviconImg } from "@/components/ui/FaviconImg";
import { ProNudgeModal } from "@/components/submit/ProNudgeModal";
import { signIn } from "next-auth/react";
import { prepareWebsite, publishWebsite } from "./submission-client";
import { startProCheckout } from "@/components/pricing/checkout-client";
import type { User } from "@/db/schema";
import { CategorySelect } from "./CategorySelect";
import { findCategory } from "@/modules/catalog/categories";
import { CountrySelect } from "./CountrySelect";
import { restoreCountryCode } from "@/modules/catalog/countries";
import { listingDetailsSchema } from "@/modules/sites/listing-fields";
import { useListingAutofill } from "./useListingAutofill";
import { AutofillDetails } from "./AutofillDetails";

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
  ttiScore: number | null;
  siScore: number;
}

interface RawSpeedData {
  score: number;
  fcp: string;
  lcp: string;
  cls: string;
  tbt: string;
  tti: string;
  si: string;
  fcpMs: number;
  lcpMs: number;
  clsRaw: number;
  tbtMs: number;
  ttiMs: number | null;
  siMs: number;
}

interface SiteMeta {
  title: string;
  description: string;
  favicon: string;
  domain: string;
}

interface Props {
  user: Pick<User, "name" | "avatarUrl" | "twitterHandle" | "isPro"> | null;
}

export function SubmitPageForm({ user }: Props) {

  const searchParams = useSearchParams();
  const justUpgraded = searchParams.get("upgraded") === "1" && user?.isPro === true;
  const returningFromCheckout = /^[a-f0-9-]{36}$/i.test(searchParams.get("checkout") || "");
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(justUpgraded);

  // Step 1: URL input
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const [preparationStatus, setPreparationStatus] = useState("Preparing your measurement request.");

  // Step 2: Results
  const [speedResult, setSpeedResult] = useState<SpeedResult | null>(null);
  const [rawSpeedData, setRawSpeedData] = useState<RawSpeedData | null>(null);
  const [siteMeta, setSiteMeta] = useState<SiteMeta | null>(null);

  // Step 3: Submit form
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [twitter, setTwitter] = useState(user?.twitterHandle || "");
  const [category, setCategory] = useState<string>(() => findCategory(searchParams.get("category") ?? "")?.slug ?? "");
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [countryError, setCountryError] = useState("");
  const [customFavicon, setCustomFavicon] = useState("");
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
  const [proSubmitUpgrade, setProSubmitUpgrade] = useState(false); // true when auto-submitted after Pro upgrade
  const autofill = useListingAutofill({ name: setName, description: setDesc, category: setCategory, faviconUrl: setCustomFavicon },
    Boolean(findCategory(searchParams.get("category") ?? "")));

  // Holds pending data for auto-submit after Pro checkout return
  const autoSubmitRef = useRef<{
    url: string; name: string; desc: string; twitter: string;
    category: string; countryCode: string | null; customFavicon: string; showOnLeaderboard: boolean;
    rawSpeedData: RawSpeedData | null;
  } | null>(null);

  // On mount: restore state from sessionStorage (from /test page OR after Pro upgrade checkout)
  useEffect(() => {
    try {
      // Priority: pending submission saved before Pro checkout — auto-submit on return.
      // A return query is not proof of payment. Account access is checked by the
      // server, and publication always consumes server-owned measurement receipts.
      const pending = sessionStorage.getItem("tfwPendingSubmit");
      if (pending && !justUpgraded && !returningFromCheckout) {
        sessionStorage.removeItem("tfwPendingSubmit");
      } else if (pending && (justUpgraded || returningFromCheckout)) {
        sessionStorage.removeItem("tfwPendingSubmit");
        const d = JSON.parse(pending);
        setUrl(d.url ?? "");
        if (d.speedResult) setSpeedResult(d.speedResult);
        if (d.rawSpeedData) setRawSpeedData(d.rawSpeedData);
        if (d.siteMeta) setSiteMeta(d.siteMeta);
        setName(d.name ?? "");
        setDesc(d.desc ?? "");
        setTwitter(d.twitter ?? (user?.twitterHandle || ""));
        setCategory(findCategory(d.category ?? "")?.slug ?? "");
        setCountryCode(restoreCountryCode(d.countryCode));
        setCustomFavicon(d.customFavicon ?? "");
        setShowOnLeaderboard(d.showOnLeaderboard ?? true);
        for (const field of ["name", "description", "category", "faviconUrl"] as const) autofill.edit(field);
        // Store for auto-submit once speedResult state is applied
        autoSubmitRef.current = justUpgraded ? {
          url: d.url ?? "",
          name: d.name ?? "",
          desc: d.desc ?? "",
          twitter: d.twitter ?? (user?.twitterHandle || ""),
          category: findCategory(d.category ?? "")?.slug ?? "",
          countryCode: restoreCountryCode(d.countryCode),
          customFavicon: d.customFavicon ?? "",
          showOnLeaderboard: d.showOnLeaderboard ?? true,
          rawSpeedData: d.rawSpeedData ?? null,
        } : null;
        return;
      }

      // Fallback: pre-loaded result from /test page
      const stored = sessionStorage.getItem("tfwSpeedResult");
      if (!stored) return;
      const data = JSON.parse(stored);
      if (!data.url || typeof data.score !== "number") return;

      setUrl(data.url);
      setSpeedResult({
        score: data.score,
        fcp: data.fcp, lcp: data.lcp, cls: data.cls,
        tbt: data.tbt, tti: data.tti, si: data.si,
        fcpScore: data.fcpScore ?? 0, lcpScore: data.lcpScore ?? 0,
        clsScore: data.clsScore ?? 0, tbtScore: data.tbtScore ?? 0,
        ttiScore: data.ttiScore ?? null, siScore: data.siScore ?? 0,
      });
      setRawSpeedData({
        score: data.score,
        fcp: data.fcp, lcp: data.lcp, cls: data.cls,
        tbt: data.tbt, tti: data.tti, si: data.si,
        fcpMs: data.fcpMs ?? 0, lcpMs: data.lcpMs ?? 0,
        clsRaw: data.clsRaw ?? 0, tbtMs: data.tbtMs ?? 0,
        ttiMs: data.ttiMs ?? null, siMs: data.siMs ?? 0,
      });

      const domain = getDomain(data.url);
      const favicon = getFaviconUrl(data.url);
      setSiteMeta({ title: domain, description: "", favicon, domain });
      autofill.populate(null, data.url);
      void autofill.refresh(data.url);
    } catch {
      // ignore parse errors
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setPreparationStatus("Preparing your measurement request.");
    autofill.reset();
    setTestError("");
    setSpeedResult(null);
    setSiteMeta(null);

    const domain = getDomain(testUrl);
    const favicon = getFaviconUrl(testUrl);

    try {
      const prepared = await prepareWebsite(testUrl, setPreparationStatus);
      const speedData = prepared.mobile.result;

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
        ttiScore: speedData.ttiScore ?? null,
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
        ttiMs: speedData.ttiMs ?? null,
        siMs: speedData.siMs ?? 0,
      });

      let title = domain;
      let description = "";
      if (prepared.metadata) {
        if (prepared.metadata.title) title = prepared.metadata.title.substring(0, 60);
        if (prepared.metadata.description) description = prepared.metadata.description.substring(0, 500);
      }

      setSiteMeta({ title, description, favicon, domain });
      autofill.populate(prepared.metadata, testUrl);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setTesting(false);
    }
  }

  async function handleUpgradeFromNudge() {
    if (!validateDetails()) return;
    // Save the full pending submission to sessionStorage before going to checkout
    sessionStorage.setItem("tfwPendingSubmit", JSON.stringify({
      url, name, desc, twitter, category, countryCode,
      customFavicon, showOnLeaderboard,
      speedResult, rawSpeedData, siteMeta,
    }));
    try { await startProCheckout(); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : "Purchases are temporarily unavailable."); setShowNudge(false); }
  }

  // Auto-submit after Pro upgrade — fires when speedResult is set from sessionStorage restore
  useEffect(() => {
    if (!autoSubmitRef.current) return;
    if (!speedResult) return;
    const d = autoSubmitRef.current;
    autoSubmitRef.current = null;
    submitFromData(d, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speedResult]);

  const submitFromData = useCallback(async (
    d: { url: string; name: string; desc: string; twitter: string; category: string; countryCode: string | null; customFavicon: string; showOnLeaderboard: boolean; rawSpeedData: RawSpeedData | null },
    isProUpgrade = false,
  ) => {
    const validation = listingDetailsSchema.safeParse({ ...d, description: d.desc, twitterHandle: d.twitter, faviconUrl: d.customFavicon });
    if (!validation.success) {
      setSubmitError(validation.error.issues[0]?.message ?? "Complete the required website details.");
      if (!d.countryCode) setCountryError("Choose your product's country of origin to finish your submission.");
      document.getElementById(`submit-${validation.error.issues[0]?.path[0] === "countryCode" ? "country" : String(validation.error.issues[0]?.path[0])}`)?.focus();
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    const fullUrl = d.url.startsWith("http") ? d.url : `https://${d.url}`;
    try {
      const resp = await publishWebsite({
          url: fullUrl,
          name: d.name,
          description: d.desc,
          twitterHandle: d.twitter || undefined,
          category: d.category,
          countryCode: validation.data.countryCode,
          faviconUrl: d.customFavicon || undefined,
          isListed: d.showOnLeaderboard,
        });
      if (resp.ok) {
        sessionStorage.removeItem("tfwSpeedResult");
        if (isProUpgrade) setProSubmitUpgrade(true);
        setSubmitted(true);
      } else {
        const data = await resp.json();
        setSubmitError(data.error || "Something went wrong");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!validateDetails()) return;
    setShowNudge(false);
    setSubmitting(true);
    setSubmitError("");

    const fullUrl = url.startsWith("http") ? url : `https://${url}`;

    try {
      const resp = await publishWebsite({
          url: fullUrl,
          name,
          description: desc,
          twitterHandle: twitter || undefined,
          category,
          countryCode: countryCode!,
          faviconUrl: customFavicon || undefined,
          isListed: showOnLeaderboard,
        });

      if (resp.ok) {
        sessionStorage.removeItem("tfwSpeedResult");
        setSubmitted(true);
      } else {
        const data = await resp.json();
        setSubmitError(data.error || "Something went wrong");
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyAndSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateDetails()) return;
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
          setVerifyError("Badge not found on your site. Paste the embed code and publish your page, then try again.");
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

  function validateDetails() {
    const result = listingDetailsSchema.safeParse({ url, name, description: desc, twitterHandle: twitter, category, countryCode, faviconUrl: customFavicon });
    if (result.success) { setCountryError(""); return true; }
    const issue = result.error.issues[0];
    setSubmitError(issue.message);
    if (result.error.issues.some(value => value.path[0] === "countryCode")) setCountryError("Choose your product's country of origin.");
    document.getElementById(`submit-${issue.path[0] === "countryCode" ? "country" : String(issue.path[0])}`)?.focus();
    return false;
  }

  function resetAll() {
    autofill.reset();
    setUrl("");
    setSpeedResult(null);
    setRawSpeedData(null);
    setSiteMeta(null);
    setName("");
    setDesc("");
    setCategory(findCategory(searchParams.get("category") ?? "")?.slug ?? "");
    setCountryCode(null);
    setCountryError("");
    setBadgeVerified(false);
    setVerifyError("");
    setCustomFavicon("");
    setShowOnLeaderboard(true);
    setSubmitted(false);
    setTestError("");
    setSubmitError("");
  }

  // ── Not logged in ──
  if (!user) {
    return (
      <div className="bg-bg-main border border-border rounded-[14px] p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-bg-elevated flex items-center justify-center mx-auto mb-4">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-text-muted">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" fill="currentColor"/>
          </svg>
        </div>
        <h3 className="font-display font-bold text-[1.1rem] mb-1.5">
          Sign in to submit
        </h3>
        <p className="text-text-muted text-[0.82rem] mb-5 max-w-xs mx-auto">
          Sign in with Google so we can link the site to your profile and auto-fill your details.
        </p>
        <button
          onClick={signInWithGoogle}
          className="inline-flex items-center gap-2.5 px-5 py-3 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-[0.88rem] cursor-pointer transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light"
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        <p className="text-[0.72rem] text-text-muted mt-4">
          <Link href="/test" className="text-accent no-underline hover:underline">
            Test speed without signing in
          </Link>
        </p>
      </div>
    );
  }

  // ── Submitted ──
  if (submitted && siteMeta) {
    return (
      <div className="py-6">
        {proSubmitUpgrade && (
          <div className="bg-gradient-to-r from-[rgba(245,158,11,0.14)] to-[rgba(245,158,11,0.04)] border border-accent/30 rounded-[12px] px-4 py-3.5 mb-5 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-bg-deep font-bold text-sm">&#10003;</span>
            </div>
            <div>
              <div className="font-display font-bold text-[0.92rem] text-text-primary">
                You&apos;re now a Pro member!
              </div>
              <p className="text-[0.76rem] text-text-secondary mt-0.5">
                Unlimited sites, dofollow backlinks, and always-on monitoring are now active.
              </p>
            </div>
          </div>
        )}
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-green-dim border border-[rgba(34,197,94,0.2)] flex items-center justify-center mx-auto mb-4">
            <span className="text-green text-2xl">&#10003;</span>
          </div>
          <h3 className="font-display font-[800] text-[1.3rem] mb-2">
            {showOnLeaderboard ? `${name} is on the leaderboard` : `${name} is now being tracked`}
          </h3>
          <p className="text-text-secondary text-[0.88rem] mb-1.5">
            Speed score: <strong className="text-green font-mono">{speedResult?.score}/100</strong>
          </p>
          <p className="text-[0.78rem] text-text-muted mb-6">
            We&apos;ll re-test daily and send trend alerts if performance declines.
          </p>
          <div className="flex gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center px-4 py-2.5 rounded-[10px] text-[0.85rem] font-semibold bg-bg-card border border-border text-text-primary no-underline transition-all duration-200 hover:bg-bg-card-hover"
            >
              View Leaderboard
            </Link>
            <button
              onClick={resetAll}
              className="inline-flex items-center px-4 py-2.5 rounded-[10px] text-[0.85rem] font-semibold bg-gradient-to-br from-accent to-accent-bright text-bg-deep border-none cursor-pointer font-body transition-all duration-200 hover:-translate-y-px"
            >
              Submit Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: URL input + testing ──
  if (!speedResult) {
    return (
      <div>
        {showUpgradeBanner && (
          <div className="bg-gradient-to-r from-[rgba(245,158,11,0.12)] to-[rgba(245,158,11,0.04)] border border-accent/30 rounded-[12px] px-4 py-3.5 mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-bg-deep text-lg font-bold">&#10003;</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-[0.95rem] text-text-primary">
                You&apos;re now a Pro member!
              </div>
              <p className="text-[0.78rem] text-text-secondary mt-0.5">
                Unlimited sites, dofollow backlinks, and always-on monitoring are now active.
              </p>
            </div>
            <button
              onClick={() => setShowUpgradeBanner(false)}
              className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none border-none bg-transparent cursor-pointer p-1"
            >
              &#10005;
            </button>
          </div>
        )}
        <div className="bg-bg-main border border-border rounded-[14px] p-6">
          <div className="mb-1.5">
            <label htmlFor="submit-url" className="block text-[0.8rem] font-semibold text-text-secondary mb-1.5">
              Website URL <span className="font-normal">(required)</span>
            </label>
            <input
              type="url"
              id="submit-url" name="url" autoComplete="url" inputMode="url" required maxLength={4096} spellCheck={false} autoCapitalize="none"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !testing && runTest()}
              placeholder="https://yoursite.com"
              disabled={testing}
              className="w-full px-3.5 py-3 rounded-[10px] bg-bg-card border border-border text-text-primary text-[0.88rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted disabled:opacity-50"
            />
          </div>
          <button
            onClick={runTest}
            disabled={testing || !url.trim()}
            className="w-full mt-3 py-3.5 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.95rem] border-none cursor-pointer font-body transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {testing ? "Testing..." : "Test Speed & Continue"}
          </button>
        </div>

        {/* Progress */}
        {testing && (
          <div className="mt-6 animate-fade-in-up">
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated overflow-hidden flex items-center justify-center">
                <FaviconImg
                  url={url.startsWith("http") ? url : `https://${url}`}
                  className="w-full h-full object-contain p-1.5"
                />
              </div>
              <div className="text-left">
                <div className="font-bold text-[0.9rem]">
                  {getDomain(url.startsWith("http") ? url : `https://${url}`)}
                </div>
              </div>
            </div>
            <div className="max-w-full mx-auto">
              <div role="status" aria-live="polite" className="flex items-center justify-center gap-2.5 text-[0.78rem] text-text-secondary">
                <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-accent/25 border-t-accent motion-safe:animate-spin" />
                <span>{preparationStatus}</span>
              </div>
              <p className="text-[0.7rem] text-text-muted mt-3 text-center">
                We’ll show your results when both device measurements are complete.
              </p>
            </div>
          </div>
        )}

        {testError && (
          <div className="text-red text-[0.82rem] mt-4 text-center">{testError}</div>
        )}
      </div>
    );
  }

  // ── Step 2: Results + Submit form ──
  return (
    <div className="animate-fade-in-up">
      {showNudge && (
        <ProNudgeModal
          onContinueFree={() => handleSubmit()}
          onClose={() => setShowNudge(false)}
          onUpgrade={handleUpgradeFromNudge}
        />
      )}

      {/* Upgrade banner (also shown in step 2 when user returns from checkout) */}
      {showUpgradeBanner && (
        <div className="bg-gradient-to-r from-[rgba(245,158,11,0.12)] to-[rgba(245,158,11,0.04)] border border-accent/30 rounded-[12px] px-4 py-3.5 mb-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent to-accent-bright flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-bg-deep text-lg font-bold">&#10003;</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display font-bold text-[0.95rem] text-text-primary">
              You&apos;re now a Pro member!
            </div>
            <p className="text-[0.78rem] text-text-secondary mt-0.5">
              Unlimited sites, dofollow backlinks, and always-on monitoring are now active.
            </p>
          </div>
          <button
            onClick={() => setShowUpgradeBanner(false)}
            className="text-text-muted hover:text-text-primary transition-colors text-lg leading-none border-none bg-transparent cursor-pointer p-1"
          >
            &#10005;
          </button>
        </div>
      )}

      {/* Speed Results */}
      <div className="bg-bg-main border border-border rounded-[14px] p-6 mb-4">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-[10px] bg-bg-elevated overflow-hidden flex items-center justify-center shrink-0">
            <FaviconImg
              url={url.startsWith("http") ? url : `https://${url}`}
              className="w-full h-full object-contain p-1.5"
            />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-[0.95rem]">{name || siteMeta?.title}</div>
            <div className="font-mono text-[0.75rem] text-text-muted truncate">{url}</div>
          </div>
          <button
            onClick={resetAll}
            className="ml-auto text-[0.75rem] text-text-muted hover:text-text-primary transition-colors shrink-0"
          >
            Test different URL
          </button>
        </div>

        <SpeedGauge score={speedResult.score} />

        <div className="grid grid-cols-3 gap-2 max-[480px]:grid-cols-2">
          <MetricCard label="FCP" value={speedResult.fcp} score={speedResult.fcpScore} />
          <MetricCard label="LCP" value={speedResult.lcp} score={speedResult.lcpScore} />
          <MetricCard label="CLS" value={speedResult.cls} score={speedResult.clsScore} />
          <MetricCard label="TBT" value={speedResult.tbt} score={speedResult.tbtScore} />
          <MetricCard label="TTI" value={speedResult.tti} score={speedResult.ttiScore} />
          <MetricCard label="SI" value={speedResult.si} score={speedResult.siScore} />
        </div>
      </div>

      {/* Submit form */}
      <div className="bg-bg-main border border-border rounded-[14px] p-6">
        <h3 className="font-display font-bold text-[1rem] mb-0.5">
          Add to leaderboard
        </h3>
        <p className="text-[0.78rem] text-text-muted mb-4">
          Confirm details and submit. Daily tracking and dofollow backlink included.
        </p>

        <form onSubmit={(e) => {
          e.preventDefault();
          if (user?.isPro) {
            handleSubmit();
          } else if (selectedPlan === "pro") {
            handleUpgradeFromNudge();
          } else {
            handleVerifyAndSubmit(e);
          }
        }}>
          <AutofillDetails loading={autofill.loading} notice={autofill.notice} disabled={submitting || verifying}
            onFill={() => { setSubmitError(""); setBadgeVerified(false); void autofill.refresh(url); }} />
          {/* Submitting as */}
          <div className="flex items-center gap-2.5 bg-bg-card border border-border rounded-lg px-3.5 py-2.5 mb-3.5">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-bg-elevated flex items-center justify-center text-[9px] font-bold text-text-muted">
                {user.name.split(" ").map(n => n[0]).join("")}
              </div>
            )}
            <span className="text-[0.8rem] text-text-primary font-medium truncate">{user.name}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3.5 max-[480px]:grid-cols-1">
            <div>
              <label htmlFor="submit-name" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
                Website Name <span className="font-normal">(required)</span>
              </label>
              <input
                type="text"
                id="submit-name" name="name" autoComplete="organization" minLength={2} maxLength={60}
                value={name}
                onChange={(e) => { autofill.edit("name"); setName(e.target.value); setBadgeVerified(false); setSubmitError(""); }}
                required
                className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.82rem] font-body outline-none transition-colors focus:border-accent placeholder:text-text-muted"
              />
            </div>
            <div>
              <label htmlFor="submit-twitterHandle" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
                X handle <span className="font-normal text-text-muted">(optional)</span>
              </label>
              <input
                type="text"
                id="submit-twitterHandle" name="twitterHandle" autoComplete="off" maxLength={30} pattern="@?[a-zA-Z0-9_]*"
                value={twitter}
                onChange={(e) => { setTwitter(e.target.value); setSubmitError(""); }}
                placeholder="@username"
                className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.82rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted"
              />
            </div>
          </div>

          <div className="mb-3.5">
            <label htmlFor="submit-description" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Short Description <span className="font-normal">(required)</span>
            </label>
            <textarea
              id="submit-description" name="description" required minLength={10} rows={3} aria-describedby="submit-description-help"
              value={desc}
              onChange={(e) => { autofill.edit("description"); setDesc(e.target.value); setSubmitError(""); }}
              placeholder="What does your site do?"
              maxLength={500}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.82rem] font-body outline-none transition-colors focus:border-accent placeholder:text-text-muted"
            />
            <p id="submit-description-help" className="mt-1 text-[0.68rem] text-text-secondary">10–500 characters. {desc.length}/500</p>
          </div>

          <div className="mb-3.5">
            <label htmlFor="submit-faviconUrl" className="block text-[0.75rem] font-semibold text-text-secondary mb-1">
              Logo / Favicon URL <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-elevated overflow-hidden flex items-center justify-center shrink-0 border border-border">
                <FaviconImg
                  url={url.startsWith("http") ? url : `https://${url}`}
                  src={customFavicon || undefined}
                  alt="Logo preview"
                  className="w-full h-full object-contain p-1"
                />
              </div>
              <input
                type="url"
                id="submit-faviconUrl" name="faviconUrl" autoComplete="off" maxLength={4096}
                value={customFavicon}
                onChange={(e) => { autofill.edit("faviconUrl"); setCustomFavicon(e.target.value); setSubmitError(""); }}
                placeholder="https://yoursite.com/logo.png"
                className="flex-1 px-3 py-2 rounded-lg bg-bg-card border border-border text-text-primary text-[0.82rem] font-mono outline-none transition-colors focus:border-accent placeholder:text-text-muted"
              />
            </div>
            <p className="text-[0.62rem] text-text-muted mt-1">
              We auto-detect your favicon. Paste a direct image URL here to override it.
            </p>
          </div>

          <CategorySelect id="submit-category" value={category} onChange={(value) => { autofill.edit("category"); setCategory(value); setSubmitError(""); }} />
          <CountrySelect id="submit-country" value={countryCode} onChange={(code) => { setCountryCode(code); setCountryError(""); setSubmitError(""); }} disabled={submitting || verifying} error={countryError} />

          {/* Leaderboard visibility toggle — only for Pro users (free always listed) */}
          {user?.isPro && (
            <div className="flex items-center justify-between bg-bg-card border border-border rounded-lg px-3.5 py-3 mb-3.5">
              <div>
                <div className="text-[0.82rem] font-medium text-text-primary">
                  Show on leaderboard
                </div>
                <div className="text-[0.68rem] text-text-muted">
                  {showOnLeaderboard
                    ? "Your site will be visible on the public leaderboard"
                    : "Private — only you can see your site and tracking data"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOnLeaderboard(!showOnLeaderboard)}
                className={`relative w-10 h-[22px] rounded-full border-none cursor-pointer transition-colors duration-200 shrink-0 ml-3 ${
                  showOnLeaderboard ? "bg-green" : "bg-bg-elevated"
                }`}
              >
                <span
                  className={`absolute top-[3px] w-4 h-4 rounded-full bg-white transition-transform duration-200 ${
                    showOnLeaderboard ? "left-[22px]" : "left-[3px]"
                  }`}
                />
              </button>
            </div>
          )}

          {/* Plan selector — only for non-Pro users */}
          {!user?.isPro && (
            <div className="mb-3.5">
              <div className="text-[0.75rem] font-semibold text-text-secondary mb-2">Choose your plan</div>
              <div className="grid grid-cols-2 gap-2.5">
                {/* Free plan card */}
                <button
                  type="button"
                  onClick={() => { setSelectedPlan("free"); setBadgeVerified(false); setVerifyError(""); }}
                  className={`text-left p-3 rounded-[10px] border transition-all duration-150 cursor-pointer ${
                    selectedPlan === "free"
                      ? "border-accent bg-[rgba(245,158,11,0.06)]"
                      : "border-border bg-bg-card hover:border-border-light"
                  }`}
                >
                  <div className="text-[0.8rem] font-bold text-text-primary mb-1.5">Free</div>
                  {[
                    ["✓", "1 site", false],
                    ["✓", "Dofollow backlink", false],
                    ["✓", "Speed alerts", false],
                    ["✓", "Daily tracking", false],
                    ["~", "Badge embed required", true],
                  ].map(([icon, label, muted]) => (
                    <div key={String(label)} className={`flex items-start gap-1 text-[0.7rem] mb-0.5 ${muted ? "text-text-muted" : "text-text-secondary"}`}>
                      <span className={muted ? "text-text-muted" : "text-green"}>{String(icon)}</span>
                      <span>{String(label)}</span>
                    </div>
                  ))}
                </button>

                {/* Pro plan card */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan("pro")}
                  className={`text-left p-3 rounded-[10px] border transition-all duration-150 cursor-pointer ${
                    selectedPlan === "pro"
                      ? "border-accent bg-[rgba(245,158,11,0.06)]"
                      : "border-border bg-bg-card hover:border-border-light"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[0.8rem] font-bold text-text-primary">Pro</div>
                    <div className="text-[0.72rem] font-bold text-accent">$9</div>
                  </div>
                  {[
                    ["✓", "Unlimited sites"],
                    ["✓", "Dofollow backlink"],
                    ["✓", "Speed alerts"],
                    ["✓", "Priority tracking"],
                    ["✓", "No badge required"],
                    ["✓", "Lifetime tracking"],
                  ].map(([icon, label]) => (
                    <div key={String(label)} className="flex items-start gap-1 text-[0.7rem] text-text-secondary mb-0.5">
                      <span className="text-green">{String(icon)}</span>
                      <span>{String(label)}</span>
                    </div>
                  ))}
                </button>
              </div>

              {/* Badge embed section — shown when Free is selected */}
              {selectedPlan === "free" && (() => {
                const badgeSlug = slugify(name) || slugify(getDomain(url));
                const domain = getDomain(url);
                const badgeOrigin = typeof window === "undefined" ? "" : window.location.origin;
                const embedCode = `<a href="${badgeOrigin}/site/${badgeSlug}" target="_blank" rel="noopener"><img src="${badgeOrigin}/api/badge/${badgeSlug}?variant=speedometer&theme=${badgeTheme}" alt="Speed Score on TheFastestWeb" width="288" height="80" /></a>`;
                return (
                  <div className="mt-3 p-3 bg-bg-card border border-border rounded-[10px]">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[0.75rem] font-semibold text-text-secondary">
                        Embed badge on your homepage
                      </div>
                      <div className="flex items-center gap-1 bg-bg-elevated border border-border rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setBadgeTheme("dark")}
                          className={`px-2.5 py-1 rounded-md text-[0.65rem] font-semibold transition-all cursor-pointer border-none ${badgeTheme === "dark" ? "bg-bg-card text-text-primary shadow-sm" : "text-text-muted bg-transparent hover:text-text-secondary"}`}
                        >
                          Dark
                        </button>
                        <button
                          type="button"
                          onClick={() => setBadgeTheme("light")}
                          className={`px-2.5 py-1 rounded-md text-[0.65rem] font-semibold transition-all cursor-pointer border-none ${badgeTheme === "light" ? "bg-bg-card text-text-primary shadow-sm" : "text-text-muted bg-transparent hover:text-text-secondary"}`}
                        >
                          Light
                        </button>
                      </div>
                    </div>
                    <p className="text-[0.68rem] text-text-muted mb-3">
                      Paste the code anywhere on your homepage, then click Verify &amp; Submit.
                    </p>

                    {/* Badge preview */}
                    <div className={`flex justify-center items-center rounded-lg p-4 mb-3 ${badgeTheme === "light" ? "bg-[#f1f5f9]" : "bg-[#070809]"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/badge/${badgeSlug}?preview=${speedResult.score}&domain=${encodeURIComponent(domain)}&variant=speedometer&theme=${badgeTheme}`}
                        alt="Badge preview"
                        width={288}
                        height={80}
                      />
                    </div>

                    <div className="relative">
                      <code className="block text-[0.62rem] text-text-secondary bg-bg-elevated border border-border rounded-lg p-2.5 pr-16 font-mono break-all leading-relaxed select-all">
                        {embedCode}
                      </code>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(embedCode);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          } catch {
                            setCopied(false);
                          }
                        }}
                        className={`absolute top-2 right-2 px-2 py-1 text-[0.62rem] font-semibold rounded-md border transition-all cursor-pointer ${copied ? "bg-green/10 border-green/40 text-green" : "bg-bg-elevated border-border text-text-muted hover:text-text-primary hover:border-border-light"}`}
                      >
                        {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    {badgeVerified && (
                      <div className="flex items-center gap-1.5 mt-2 text-[0.72rem] text-green">
                        <span>&#10003;</span> Badge verified on your site
                      </div>
                    )}
                    {verifyError && (
                      <div className="text-red text-[0.72rem] mt-2">{verifyError}</div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {submitError && (
            <div className="text-red text-[0.82rem] mb-3">{submitError}</div>
          )}

          <button
            type="submit"
            disabled={submitting || verifying}
            className="w-full py-3 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.92rem] border-none cursor-pointer font-body transition-all duration-200 flex items-center justify-center gap-2 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-bg-deep/30 border-t-bg-deep rounded-full animate-spin" />
                Submitting...
              </>
            ) : verifying ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-bg-deep/30 border-t-bg-deep rounded-full animate-spin" />
                Verifying badge...
              </>
            ) : user?.isPro ? (
              "Submit to Leaderboard"
            ) : selectedPlan === "pro" ? (
              "Pay & Submit \u2192"
            ) : (
              "Verify & Submit"
            )}
          </button>

          <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-1 mt-3.5 text-[0.7rem] text-text-muted">
            {["Daily monitoring", "Speed trend alerts", "Full tracking history", "Leaderboard listing"].map((label) => (
              <span key={label} className="flex items-center gap-1">
                <span className="text-green text-[0.6rem]">&#10003;</span>
                {label}
              </span>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
