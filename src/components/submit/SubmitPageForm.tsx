"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { ArrowLeft, ArrowRight, ArrowUpRight, CaretDown, Check, CheckCircle, Copy, Desktop, DeviceMobile, GoogleLogo, Info, LinkSimple, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { slugify } from "@/lib/utils";
import type { User } from "@/db/schema";
import type { ExistingListing, getSubmissionPreparation } from "@/modules/submissions/service";
import { ScoreTicks, scoreTone } from "@/components/ui/ScoreTicks";
import { monogram } from "@/components/directory/WebsiteList";
import { PageSpeedPending } from "@/components/speed-test/PageSpeedPending";
import { SkeletonBar } from "@/components/speed-test/InstrumentKeyframes";

type Prepared = Awaited<ReturnType<typeof getSubmissionPreparation>>;
type CatalogItem = { id: string; slug: string; name: string };
type Props = {
  user: Pick<User, "id" | "name" | "isPro"> | null; siteUrl: string;
  catalog: { categories: CatalogItem[]; technologies: CatalogItem[]; countries: { code: string; name: string }[] } | null;
  founder: { id: string; name: string; visibility: "public" | "private" } | null;
};
type Draft = { name: string; description: string; tagline: string; categoryId: string; technologyIds: string[]; countryCode: string;
  faviconUrl: string; includeFounder: boolean; listed: boolean; social: Record<string, string> };
const emptyDraft: Draft = { name: "", description: "", tagline: "", categoryId: "", technologyIds: [], countryCode: "", faviconUrl: "", includeFounder: false, listed: true, social: {} };
const socialFields = [{ id: "x", label: "X / Twitter" }, { id: "github", label: "GitHub" }, { id: "linkedin", label: "LinkedIn" }, { id: "bluesky", label: "Bluesky" }];
const steps = [
  { label: "Website URL", detail: "We read your public website details and measure both devices." },
  { label: "Review details", detail: "Edit everything we found before it goes public." },
  { label: "Publish", detail: "Your profile goes live with the measurements from this submission." },
];
const afterPublishing = [
  "Your profile includes the measurements taken during this submission.",
  "Future measurements build its history over time.",
  "Free public listings include a badge linking back to your measured profile.",
  "Scores are lab measurements. They are not field data and may vary between runs.",
];
async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request could not be completed. Please try again.");
  return data;
}

// globals.css resets `font` on form controls outside any cascade layer, which beats .form-field, .button-* and plain utilities. Type on controls is pinned with important utilities.
const fieldClass = "form-field text-[15px]! font-normal!";
const labelClass = "block text-sm font-semibold text-text-primary";
const groupTitle = "text-lg font-semibold tracking-[-.02em] text-text-primary font-stretch-[112%]";
const focusWithin = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent";
const optional = <span className="ml-1.5 font-normal text-text-muted">optional</span>;

/** One device on the timing board: the score, its tick rule, and three lab timings. */
function Measurement({ device, note, proof }: { device: "Mobile" | "Desktop"; note?: string; proof: Prepared["mobile"] }) {
  const rows = [["FCP", proof?.result.fcp], ["LCP", proof?.result.lcp], ["CLS", proof?.result.clsDisplay]] as const;
  return <div className="min-w-0">
    <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">{device === "Mobile" ? <DeviceMobile size={18} aria-hidden /> : <Desktop size={18} aria-hidden />}{device}{note && <span className="font-normal text-text-muted">{note}</span>}</p>
    {proof ? <p className={"stat-value mt-4 text-6xl font-medium leading-none " + scoreTone(proof.result.score)}>{proof.result.score}<span className="ml-2.5 font-sans text-sm font-normal normal-nums tracking-normal text-text-muted">out of 100</span></p>
      : <div className="mt-4 flex h-[60px] items-center gap-4"><SkeletonBar className="h-11 w-24 rounded-xl" /><p className="text-sm text-text-muted">Waiting for measurement</p></div>}
    <ScoreTicks score={proof ? proof.result.score : null} className={"mt-5 " + (proof ? "" : "opacity-50")} />
    <dl className="mt-4 text-sm">{rows.map(([term, value]) => <div key={term} className="flex items-center justify-between gap-4 border-t border-border py-2.5"><dt className="font-semibold text-text-muted font-stretch-[112%]">{term}</dt><dd className="stat-value text-text-primary">{proof ? value : <SkeletonBar className="h-3.5 w-12" />}</dd></div>)}</dl>
  </div>;
}

/** The dark timing screen from the home page, reused for measurements in every step. */
function TimingBoard({ children, footer }: { children: ReactNode; footer?: string }) {
  return <div className="relative overflow-hidden rounded-[28px] border border-border bg-bg-main text-text-primary shadow-pop">
    <div aria-hidden className="dot-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />
    <div className="relative px-5 py-6 sm:px-9 sm:py-8">{children}</div>
    {footer && <p className="relative border-t border-border px-5 py-4 text-[13px] leading-relaxed text-text-muted sm:px-9">{footer}</p>}
  </div>;
}

function PrivatePreview({ id }: { id: string }) {
  const [failed, setFailed] = useState(false), [version, setVersion] = useState(0);
  return <section className="mt-12 border-t border-border pt-9"><h3 className={groupTitle}>Private screenshot preview</h3>{failed ? <div className="panel-quiet mt-5 flex flex-col items-start gap-4 p-6 text-sm text-text-secondary sm:flex-row sm:items-center sm:justify-between"><p>Your preview is still processing or temporarily unavailable.</p><button type="button" className="button-secondary shrink-0 text-sm! font-semibold!" onClick={() => { setFailed(false); setVersion((value) => value + 1); }}>Retry preview</button></div> :
    <Image src={`/api/submissions/${id}/preview?v=${version}`} alt="A captured view of your website" width={1440} height={900} unoptimized className="mt-5 w-full rounded-2xl border border-border shadow-panel" onError={() => setFailed(true)} />}</section>;
}

export function SubmitPageForm({ user, siteUrl, catalog, founder }: Props) {
  const query = useSearchParams();
  const [url, setUrl] = useState(query.get("url") ?? "");
  const [step, setStep] = useState<0 | 1 | 2>(0), [draft, setDraft] = useState<Draft>(emptyDraft);
  const [jobId, setJobId] = useState<string | null>(null), [prepared, setPrepared] = useState<Prepared | null>(null);
  const [existing, setExisting] = useState<ExistingListing | null>(null), [error, setError] = useState("");
  const [preparing, setPreparing] = useState(false), [submitting, setSubmitting] = useState(false), [pollVersion, setPollVersion] = useState(0);
  const [published, setPublished] = useState<{ slug: string; listed: boolean } | null>(null);
  const [badgeVerified, setBadgeVerified] = useState(false), [verifying, setVerifying] = useState(false), [copied, setCopied] = useState(false);
  const slug = slugify(draft.name), badgeRequired = Boolean(user && !user.isPro && draft.listed);
  const badgeCode = `<a href="${siteUrl}/site/${slug}" target="_blank" rel="noopener"><img src="${siteUrl}/api/badge/${slug}?variant=speedometer&theme=dark" alt="Performance on TheFastestWeb" width="288" height="80" /></a>`;

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let polls = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/submissions/${jobId}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        const data: Prepared = await readResponse(response);
        if (controller.signal.aborted) return;
        setPrepared(data);
        if (data.duplicate) { setExisting(data.duplicate); setPreparing(false); return; }
        if (data.status === "succeeded") {
          setPreparing(false);
          if (!data.mobile || !data.desktop) { setError("These measurements have expired. Prepare your website again to continue."); return; }
          const suggested = catalog?.categories.find((item) => item.slug === data.metadata?.suggestedCategory) ?? catalog?.categories.find((item) => item.slug === "other");
          setDraft({ ...emptyDraft, name: data.metadata?.title || new URL(data.url).hostname, description: data.metadata?.description || "",
            faviconUrl: data.metadata?.faviconUrl || "", categoryId: suggested?.id || "", includeFounder: Boolean(founder),
            technologyIds: catalog?.technologies.filter((item) => data.metadata?.technologies.some((entry) => entry.slug === item.slug)).map((item) => item.id) ?? [] });
          setStep(1); return;
        }
        if (data.status === "failed" || data.status === "cancelled") { setPreparing(false); setError("We could not finish the measurements. Please check that your website is publicly reachable, then try again."); return; }
        if (++polls >= 120) { setPreparing(false); setError("Your request is still queued. You can check its status again without starting another test."); return; }
        timer = setTimeout(poll, 2500);
      } catch (cause) { if (!controller.signal.aborted) { setPreparing(false); setError(cause instanceof Error ? cause.message : "Status is temporarily unavailable."); } }
    };
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [jobId, pollVersion, catalog, founder]);

  async function prepare(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    setPreparing(true); setError(""); setExisting(null); setPrepared(null); setBadgeVerified(false); setJobId(null);
    try {
      const response = await fetch("/api/submissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal: AbortSignal.timeout(15_000) });
      const data = await readResponse(response);
      if (data.existing) { setExisting(data); setPreparing(false); } else setJobId(data.jobId);
    } catch (cause) { setPreparing(false); setError(cause instanceof Error ? cause.message : "Preparation could not start."); }
  }
  function review(event: FormEvent) { event.preventDefault(); if (!slug) { setError("Choose a name containing letters or numbers."); return; } setError(""); setStep(2); }
  async function verifyBadge() {
    if (!prepared) return;
    setVerifying(true); setError("");
    try {
      const data = await readResponse(await fetch(`/api/verify-badge?url=${encodeURIComponent(prepared.url)}&slug=${encodeURIComponent(slug)}`, { signal: AbortSignal.timeout(40_000) }));
      setBadgeVerified(data.verified === true); if (!data.verified) setError(data.reason || "The badge could not be found on your website yet.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Badge verification is temporarily unavailable."); }
    finally { setVerifying(false); }
  }
  async function publish() {
    if (!prepared?.mobile || !prepared.desktop || Date.parse(prepared.mobile.expiresAt) <= Date.now() || Date.parse(prepared.desktop.expiresAt) <= Date.now()) {
      setError("Your measurements have expired. Return to the URL step and prepare the website again."); return;
    }
    setSubmitting(true); setError("");
    try {
      const category = catalog?.categories.find((item) => item.id === draft.categoryId);
      const response = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000), body: JSON.stringify({
        url: prepared.url, name: draft.name, description: draft.description, tagline: draft.tagline, countryCode: draft.countryCode || null,
        category: ["saas", "tool", "directory", "agency", "ecommerce", "blog", "portfolio", "other"].includes(category?.slug ?? "") ? category?.slug : "other",
        categoryIds: [draft.categoryId], technologyIds: draft.technologyIds, founderIds: draft.includeFounder && founder ? [founder.id] : [],
        socialLinks: Object.entries(draft.social).filter(([, value]) => value.trim()).map(([platform, value]) => ({ platform, url: value.trim() })),
        faviconUrl: draft.faviconUrl, isListed: draft.listed, testResultId: prepared.mobile.id, desktopTestResultId: prepared.desktop.id, preparationId: prepared.id,
      }) });
      const data = await readResponse(response); setPublished({ slug: data.slug, listed: draft.listed });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Publishing is temporarily unavailable."); }
    finally { setSubmitting(false); }
  }
  const reset = () => { setStep(0); setJobId(null); setPreparing(false); setError(""); setExisting(null); };

  if (published) return <section className="surface-brand relative overflow-hidden rounded-[28px] px-7 py-12 sm:px-12 sm:py-16">
    <CheckCircle size={44} weight="fill" aria-hidden />
    <h2 className="mt-6 max-w-[16ch] text-[clamp(2rem,5vw,4.25rem)] font-bold leading-[.98] tracking-[-.05em] font-stretch-[120%]">{published.listed ? "Your website is published." : "Your private listing is saved."}</h2>
    <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-text-secondary">Your profile includes the measurements taken during this submission. Future measurements build its history over time.</p>
    <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3"><Link className="button-ink min-h-12 px-6 text-[15px]" href={`/site/${published.slug}`}>View website <ArrowUpRight size={18} weight="bold" aria-hidden /></Link><Link className="inline-flex min-h-11 items-center text-[15px] font-semibold text-text-primary underline decoration-2 underline-offset-4" href="/dashboard">Open dashboard</Link></div>
    <div aria-hidden className="tick-rule mt-12 opacity-70" />
  </section>;

  // One recoverable message at a time, shown next to the control that caused it.
  const alert = error ? <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-dim px-5 py-4 text-sm leading-relaxed text-text-primary"><WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red" aria-hidden /><div className="min-w-0"><p>{error}</p>{jobId && !preparing && step === 0 && <button className="button-secondary mt-3 min-h-10 px-4 text-[13px]! font-semibold!" type="button" onClick={() => { setError(""); setPreparing(true); setPollVersion((value) => value + 1); }}>Check status</button>}</div></div> : null;
  const category = catalog?.categories.find((item) => item.id === draft.categoryId)?.name;
  const country = draft.countryCode ? catalog?.countries.find((item) => item.code === draft.countryCode)?.name : undefined;
  const technologies = catalog?.technologies.filter((item) => draft.technologyIds.includes(item.id)).map((item) => item.name).join(", ");

  return <div className="flex flex-col gap-y-10 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-x-16 xl:gap-x-24">
    <div className="contents lg:sticky lg:top-28 lg:col-start-2 lg:row-start-1 lg:block">
      <ol className="order-1 grid grid-cols-3 gap-3 lg:grid-cols-1 lg:gap-0" aria-label="Submission steps">{steps.map((item, index) => { const current = step === index, done = step > index; return <li key={item.label} aria-current={current ? "step" : undefined} className={`flex flex-col gap-2.5 border-t-2 pt-3 lg:flex-row lg:gap-4 lg:border-t lg:border-border lg:py-5 ${current || done ? "border-text-primary" : "border-border"}`}>
        <span className={`stat-value inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium ${current ? "bg-brand text-on-brand" : done ? "bg-text-primary text-bg-main" : "border border-border-light text-text-muted"}`}>{done ? <Check size={14} weight="bold" aria-hidden /> : `0${index + 1}`}</span>
        <span className="min-w-0"><span className={`block text-sm font-semibold leading-snug ${current || done ? "text-text-primary" : "text-text-muted"}`}>{item.label}</span><span className="mt-1 hidden text-[13px] leading-relaxed text-text-muted lg:block">{item.detail}</span>{done && <span className="sr-only"> (completed)</span>}</span>
      </li>; })}</ol>
      <aside aria-label="After you publish" className="order-3 border-t border-border-light pt-6 lg:mt-4">
        <h2 className="text-[15px] font-semibold text-text-primary">After you publish</h2>
        <ul className="mt-3 text-sm leading-relaxed text-text-secondary">{afterPublishing.map((line) => <li key={line} className="flex gap-3 border-t border-border py-3 first:border-t-0"><Check size={16} weight="bold" className="mt-1 shrink-0 text-text-muted" aria-hidden />{line}</li>)}</ul>
      </aside>
    </div>

    <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-1">
      {step === 0 && <form onSubmit={prepare}>
        <label htmlFor="submission-url" className={labelClass}>Your website address</label>
        <div className="relative mt-3">
          <LinkSimple aria-hidden size={22} className="pointer-events-none absolute left-6 top-8 -translate-y-1/2 text-text-muted" />
          <input id="submission-url" className="form-field h-16 rounded-full pl-14 pr-5 text-[17px]! shadow-panel disabled:opacity-70 sm:pr-[13rem]" inputMode="url" autoComplete="url" placeholder="https://yourwebsite.com" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} required disabled={preparing} />
          <button className="button-primary mt-3 min-h-14 w-full px-6 text-[15px]! font-semibold! sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:min-h-12 sm:w-auto" type="submit" disabled={!user || preparing || !catalog}>{preparing ? "Preparing" : "Prepare website"}{preparing ? <SpinnerGap size={18} weight="bold" className="animate-spin" aria-hidden /> : <ArrowRight size={18} weight="bold" aria-hidden />}</button>
        </div>
        {alert && <div className="mt-4">{alert}</div>}
        <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-text-secondary">We read your public website details and run two PageSpeed measurements on each device. You can review and edit everything before publishing.</p>
        {!user && <div className="panel-quiet mt-9 flex flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center sm:p-7"><p className="max-w-[38ch] font-medium leading-snug text-text-primary">Sign in to keep your measurements linked to your account.</p><button type="button" className="button-ink shrink-0 text-sm! font-semibold!" onClick={() => void signIn("google", { callbackUrl: `/submit?url=${encodeURIComponent(url)}` })}><GoogleLogo size={18} weight="bold" aria-hidden />Continue with Google</button></div>}
        {!catalog && <p role="status" className="mt-5 flex items-start gap-3 rounded-2xl bg-red-dim px-5 py-4 text-sm leading-relaxed text-text-primary"><WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0 text-red" aria-hidden />The category catalog is temporarily unavailable. Please reload this page before preparing your website.</p>}
        {preparing && <div className="mt-10"><TimingBoard>
          <PageSpeedPending title={prepared?.status === "running" ? "Measuring your public website" : "Waiting for an available measurement slot"} target={prepared?.url} detail="Measurements continue on the server. Busy queues and provider limits may increase the waiting time." />
          <div className="mt-9 grid gap-x-14 gap-y-10 sm:grid-cols-2"><Measurement device="Mobile" proof={prepared?.mobile ?? null} /><Measurement device="Desktop" proof={prepared?.desktop ?? null} /></div>
        </TimingBoard></div>}
        {existing && <div className="panel mt-9 p-6 sm:p-8"><h2 className="text-xl font-semibold tracking-[-.03em]">This website is already registered.</h2><p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-text-secondary">{existing.site?.owned ? "You can manage your existing listing from your dashboard." : existing.canClaim ? "If this is your website, verify ownership to manage it." : "A second listing cannot be created for this address."}</p><div className="mt-6 flex flex-wrap gap-3">{existing.site?.owned ? <Link href="/dashboard" className="button-ink">Manage website</Link> : existing.canClaim && existing.site ? <Link href={`/claim?site=${existing.site.id}`} className="button-ink">Claim this website</Link> : null}{existing.site && <Link href={`/site/${existing.site.slug}`} className="button-secondary">View listing</Link>}</div></div>}
      </form>}

      {step === 1 && prepared && <form onSubmit={review}>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4"><div className="min-w-0"><h2 className="section-title">Make the listing yours.</h2><p className="mt-3 [overflow-wrap:anywhere] text-sm text-text-muted">{prepared.url}</p></div><button className="link-underline text-sm! font-[550]!" type="button" onClick={reset}>Change URL</button></div>
        {prepared.warnings.length > 0 && <div className="mt-7 space-y-3">{prepared.warnings.map((warning) => <p key={warning} className="panel-quiet flex items-start gap-3 rounded-2xl px-5 py-4 text-sm leading-relaxed text-text-secondary" role="status"><Info size={20} className="mt-0.5 shrink-0 text-text-primary" aria-hidden />{warning}</p>)}</div>}
        {prepared.metadata?.canonicalUrl && prepared.metadata.canonicalUrl !== prepared.url && <p className="mt-5 max-w-[70ch] text-[13px] leading-relaxed text-text-muted">The page declares a canonical URL of <span className="[overflow-wrap:anywhere] text-text-secondary">{prepared.metadata.canonicalUrl}</span>. Your submitted address remains unchanged.</p>}

        <section className="mt-10 border-t border-border pt-9"><h3 className={groupTitle}>Details</h3>
          <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2"><label className={labelClass}>Site name<input className={fieldClass + " mt-2"} required minLength={2} maxLength={60} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setBadgeVerified(false); }} /></label><label className={labelClass}>Tagline{optional}<input className={fieldClass + " mt-2"} maxLength={140} value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} /></label></div>
          <label className={labelClass + " mt-6"}>Description<textarea className={fieldClass + " mt-2 min-h-32 resize-y leading-relaxed!"} required minLength={10} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /><span className="stat-value mt-2 block text-right text-xs font-normal text-text-muted">{draft.description.length}/500</span></label>
        </section>

        <section className="mt-10 border-t border-border pt-9"><h3 className={groupTitle}>Category and location</h3>
          <div className="mt-6 grid gap-x-5 gap-y-6 sm:grid-cols-2"><label className={labelClass}>Primary category<span className="relative mt-2 block"><select className={fieldClass + " appearance-none pr-11"} value={draft.categoryId} required onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Choose a category</option>{catalog?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><CaretDown size={16} weight="bold" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden /></span></label><label className={labelClass}>Country{optional}<span className="relative mt-2 block"><select className={fieldClass + " appearance-none pr-11"} value={draft.countryCode} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value })}><option value="">Not specified</option>{catalog?.countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select><CaretDown size={16} weight="bold" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden /></span><span className="mt-2 block text-[13px] font-normal leading-relaxed text-text-muted">Choose the website or business location. Hosting location is not used.</span></label></div>
        </section>

        <fieldset className="mt-10 border-t border-border pt-9"><legend className={"float-left w-full " + groupTitle}>Technologies <span className="ml-1.5 text-sm font-normal tracking-normal text-text-muted font-stretch-[100%]">review detected suggestions</span></legend>
          <div className="clear-both flex flex-wrap gap-2 pt-6">{catalog?.technologies.map((item) => { const detected = prepared.metadata?.technologies.find((entry) => entry.slug === item.slug), checked = draft.technologyIds.includes(item.id); return <label key={item.id} className={`chip relative min-h-9 cursor-pointer select-none ${focusWithin} ${checked ? "chip-active" : "hover:border-text-primary hover:text-text-primary"}`}><input type="checkbox" className="sr-only" checked={checked} onChange={(event) => setDraft({ ...draft, technologyIds: event.target.checked ? [...draft.technologyIds, item.id] : draft.technologyIds.filter((id) => id !== item.id) })} />{checked && <Check size={13} weight="bold" aria-hidden />}<span>{item.name}</span>{detected && <span className={"text-xs font-normal " + (checked ? "opacity-80" : "text-text-muted")} title={detected.evidence}>Detected on page</span>}</label>; })}</div>
          <p className="mt-5 max-w-[70ch] text-[13px] leading-relaxed text-text-muted">Detection uses visible page and response evidence. It cannot identify every server technology; you can correct these selections.</p>
        </fieldset>

        <section className="mt-10 border-t border-border pt-9"><h3 className={groupTitle}>Logo and links</h3>
          <label className={labelClass + " mt-6"}>Logo or favicon URL{optional}<input className={fieldClass + " mt-2"} type="url" value={draft.faviconUrl} onChange={(event) => setDraft({ ...draft, faviconUrl: event.target.value })} maxLength={2048} /></label>
          <fieldset className="mt-7"><legend className={"float-left w-full " + labelClass}>Social links{optional}</legend><div className="clear-both grid gap-x-5 gap-y-5 pt-4 sm:grid-cols-2">{socialFields.map((field) => <label key={field.id} className="block text-[13px] font-medium text-text-secondary">{field.label}<input className={fieldClass + " mt-2"} type="url" placeholder="https://" maxLength={2048} value={draft.social[field.id] ?? ""} onChange={(event) => setDraft({ ...draft, social: { ...draft.social, [field.id]: event.target.value } })} /></label>)}</div></fieldset>
        </section>

        <section className="mt-10 border-t border-border pt-9"><h3 className={groupTitle}>Founder</h3>{founder ? <label className={`mt-5 flex cursor-pointer items-start gap-3.5 rounded-2xl border bg-bg-main p-5 text-sm font-medium transition-colors hover:border-text-muted ${draft.includeFounder ? "border-text-primary" : "border-border-light"}`}><input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-text-primary" checked={draft.includeFounder} onChange={(event) => setDraft({ ...draft, includeFounder: event.target.checked })} /><span>Link {founder.name}&apos;s founder profile{founder.visibility === "private" && <span className="mt-1 block text-[13px] font-normal text-text-muted">Your profile remains private until you publish it.</span>}</span></label> : <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-text-secondary">You can create and link your founder profile from the <Link className="link-underline" href="/dashboard">dashboard</Link> after publishing.</p>}</section>

        <section className="mt-12"><h3 className="sr-only">Measurements</h3><TimingBoard footer="Scores are the arithmetic mean of two lab measurements per device. They are not field data and may vary between runs.">
          <div className="grid gap-x-14 gap-y-10 sm:grid-cols-2"><Measurement device="Mobile" note="two samples" proof={prepared.mobile} /><Measurement device="Desktop" note="two samples" proof={prepared.desktop} /></div>
        </TimingBoard></section>
        {prepared.hasScreenshot && <PrivatePreview id={prepared.id} />}
        {alert && <div className="mt-10">{alert}</div>}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-8"><button className="button-secondary text-sm! font-semibold!" type="button" onClick={reset}><ArrowLeft size={16} weight="bold" aria-hidden />Back to URL</button><button className="button-primary min-h-12 px-6 text-[15px]! font-semibold!" type="submit">Review publication <ArrowRight size={18} weight="bold" aria-hidden /></button></div>
      </form>}

      {step === 2 && prepared && <div>
        <div className="flex items-start gap-5"><span aria-hidden className="monogram h-16 w-16 rounded-2xl text-2xl">{monogram(draft.name)}</span><div className="min-w-0"><h2 className="section-title break-words">{draft.name}</h2><p className="mt-2 [overflow-wrap:anywhere] text-sm text-text-muted">{prepared.url}</p></div></div>
        <p className="mt-7 max-w-[64ch] text-[17px] leading-relaxed text-text-secondary">{draft.description}</p>
        <dl className="mt-8 text-[15px]">{([["Category", category], ["Country", country], ["Technologies", technologies]] as const).filter(([, value]) => value).map(([term, value]) => <div key={term} className="flex items-baseline justify-between gap-8 border-t border-border py-4"><dt className="shrink-0 text-text-secondary">{term}</dt><dd className="text-right font-semibold text-text-primary">{value}</dd></div>)}
          {([["Mobile score", prepared.mobile], ["Desktop score", prepared.desktop]] as const).map(([term, proof]) => <div key={term} className="flex items-center justify-between gap-8 border-t border-border py-4 last:border-b"><dt className="shrink-0 text-text-secondary">{term}</dt><dd className="flex items-center gap-5"><ScoreTicks score={proof?.result.score} className="hidden w-32 sm:block" /><span className={"stat-value w-10 text-right text-xl font-medium " + scoreTone(proof?.result.score, Boolean(proof))}>{proof ? proof.result.score : "–"}</span></dd></div>)}
        </dl>
        {user?.isPro && <label className={`mt-8 flex cursor-pointer items-start gap-3.5 rounded-2xl border bg-bg-main p-5 text-sm font-medium transition-colors hover:border-text-muted ${draft.listed ? "border-text-primary" : "border-border-light"}`}><input type="checkbox" className="mt-0.5 size-[18px] shrink-0 accent-text-primary" checked={draft.listed} onChange={(event) => setDraft({ ...draft, listed: event.target.checked })} /><span>Publish on the public directory<span className="mt-1 block text-[13px] font-normal text-text-muted">Turn this off to save a private listing.</span></span></label>}
        {badgeRequired && <section className="mt-12 border-t border-border pt-9"><h3 className={groupTitle}>Add your performance badge</h3><p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-text-secondary">Free public listings include a badge linking back to your measured profile. Add this code to the submitted page, then verify it.</p>
          <div className="mt-5"><textarea aria-label="Badge embed code" readOnly value={badgeCode} rows={4} className="form-field resize-none rounded-2xl bg-bg-main p-5 font-mono! text-xs! leading-relaxed! text-text-secondary" /></div>
          <div className="mt-4 flex flex-wrap items-center gap-3"><button className="button-secondary text-sm! font-semibold!" type="button" onClick={() => void navigator.clipboard.writeText(badgeCode).then(() => setCopied(true)).catch(() => setError("Copy the badge code directly from the field above."))}>{copied ? <Check size={16} weight="bold" aria-hidden /> : <Copy size={16} weight="bold" aria-hidden />}{copied ? "Copied" : "Copy code"}</button><button className={(badgeVerified ? "button-secondary text-green" : "button-ink") + " text-sm! font-semibold!"} type="button" disabled={verifying} onClick={() => void verifyBadge()}>{verifying ? <SpinnerGap size={16} weight="bold" className="animate-spin" aria-hidden /> : badgeVerified ? <CheckCircle size={18} weight="fill" aria-hidden /> : null}{verifying ? "Checking badge…" : badgeVerified ? "Badge verified" : "Verify badge"}</button></div>
        </section>}
        {alert && <div className="mt-8">{alert}</div>}
        <p className="mt-9 max-w-[70ch] text-[13px] leading-relaxed text-text-muted">Publishing uses your verified server measurements. Public listings appear in the directory; future captures and measurements are added when available.</p>
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-8"><button className="button-secondary text-sm! font-semibold!" type="button" disabled={submitting} onClick={() => setStep(1)}><ArrowLeft size={16} weight="bold" aria-hidden />Edit details</button><div className="flex flex-wrap items-center gap-x-5 gap-y-3">{badgeRequired && !badgeVerified && <p className="text-[13px] text-text-muted">Verify the badge to publish.</p>}<button className="button-primary min-h-12 px-6 text-[15px]! font-semibold!" type="button" disabled={submitting || (badgeRequired && !badgeVerified)} onClick={() => void publish()}>{submitting ? <SpinnerGap className="animate-spin" size={18} weight="bold" aria-hidden /> : <Check size={18} weight="bold" aria-hidden />}{submitting ? "Publishing…" : draft.listed ? "Publish website" : "Save private listing"}</button></div></div>
      </div>}
    </div>
  </div>;
}
