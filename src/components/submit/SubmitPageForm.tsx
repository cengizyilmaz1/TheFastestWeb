"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { ArrowRight, Check, GlobeSimple, SpinnerGap } from "@phosphor-icons/react";
import { slugify } from "@/lib/utils";
import type { User } from "@/db/schema";
import type { ExistingListing, getSubmissionPreparation } from "@/modules/submissions/service";

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
async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The request could not be completed. Please try again.");
  return data;
}

function Measurement({ label, proof }: { label: string; proof: Prepared["mobile"] }) {
  return <div className="py-5"><p className="min-h-10 text-sm text-text-secondary sm:min-h-0">{label}</p>{proof ? <>
    <p className="mt-2 font-mono text-4xl tracking-tight">{proof.result.score}<span className="text-base text-text-muted"> / 100</span></p>
    <dl className="mt-4 grid grid-cols-3 gap-3 text-xs"><div><dt className="text-text-muted">FCP</dt><dd className="mt-1 font-mono">{proof.result.fcp}</dd></div><div><dt className="text-text-muted">LCP</dt><dd className="mt-1 font-mono">{proof.result.lcp}</dd></div><div><dt className="text-text-muted">CLS</dt><dd className="mt-1 font-mono">{proof.result.clsDisplay}</dd></div></dl>
  </> : <p className="mt-4 text-sm text-text-muted">Waiting for measurement</p>}</div>;
}

function PrivatePreview({ id }: { id: string }) {
  const [failed, setFailed] = useState(false), [version, setVersion] = useState(0);
  return <div className="mt-6 border-t border-border pt-5"><p className="mb-3 text-sm font-medium">Private screenshot preview</p>{failed ? <div className="text-sm text-text-secondary"><p>Your preview is still processing or temporarily unavailable.</p><button type="button" className="mt-3 button-secondary" onClick={() => { setFailed(false); setVersion((value) => value + 1); }}>Retry preview</button></div> :
    <Image src={`/api/submissions/${id}/preview?v=${version}`} alt="A captured view of your website" width={1440} height={900} unoptimized className="w-full rounded-lg border border-border" onError={() => setFailed(true)} />}</div>;
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
  if (published) return <section className="rounded-xl border border-border p-8"><Check size={32} className="mb-5 text-green" /><h2 className="text-2xl font-semibold">{published.listed ? "Your website is published." : "Your private listing is saved."}</h2><p className="mt-3 text-text-secondary">Your profile includes the measurements taken during this submission. Future measurements build its history over time.</p><div className="mt-6 flex flex-wrap gap-3"><Link className="button-primary" href={`/site/${published.slug}`}>View website <ArrowRight size={18} /></Link><Link className="button-secondary" href="/dashboard">Open dashboard</Link></div></section>;

  return <div>
    <ol className="mb-8 grid grid-cols-3 border-b border-border" aria-label="Submission steps">{["Website URL", "Review details", "Publish"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined} className={`flex items-center gap-2 border-b-2 px-1 pb-4 text-sm ${step === index ? "border-accent text-text-primary" : "border-transparent text-text-muted"}`}><span className="font-mono text-xs">0{index + 1}</span><span>{label}</span></li>)}</ol>
    {error && <div role="alert" className="mb-6 rounded-lg border border-red/30 bg-red-dim p-4 text-sm leading-relaxed">{error}{jobId && !preparing && step === 0 && <button className="ml-3 underline underline-offset-4" type="button" onClick={() => { setError(""); setPreparing(true); setPollVersion((value) => value + 1); }}>Check status</button>}</div>}
    {step === 0 && <form onSubmit={prepare}><label htmlFor="submission-url" className="mb-2 block text-sm font-medium">Your website address</label><div className="flex flex-col gap-3 sm:flex-row"><input id="submission-url" className="form-field flex-1" inputMode="url" autoComplete="url" placeholder="https://yourwebsite.com" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} required disabled={preparing} /><button className="button-primary shrink-0" type="submit" disabled={!user || preparing || !catalog}>{preparing ? <SpinnerGap size={19} className="animate-spin" /> : <ArrowRight size={19} />} {preparing ? "Preparing" : "Prepare website"}</button></div>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-secondary">We read your public website details and run two PageSpeed measurements on each device. You can review and edit everything before publishing.</p>
      {!user && <div className="mt-6 border-t border-border pt-6"><p className="mb-3 text-sm text-text-secondary">Sign in to keep your measurements linked to your account.</p><button type="button" className="button-secondary" onClick={() => void signIn("google", { callbackUrl: `/submit?url=${encodeURIComponent(url)}` })}>Continue with Google</button></div>}
      {!catalog && <p role="status" className="mt-4 text-sm text-red">The category catalog is temporarily unavailable. Please reload this page before preparing your website.</p>}
      {preparing && <div className="mt-8 border-t border-border pt-6" role="status" aria-live="polite"><div className="flex items-center gap-3"><SpinnerGap size={20} className="animate-spin text-accent" /><p className="text-sm">{prepared?.status === "running" ? "Measuring your public website" : "Waiting for an available measurement slot"}</p></div><div className="mt-3 grid grid-cols-2 gap-8 divide-x divide-border"><Measurement label="Mobile" proof={prepared?.mobile ?? null} /><div className="pl-6"><Measurement label="Desktop" proof={prepared?.desktop ?? null} /></div></div><p className="text-xs text-text-muted">Measurements continue on the server. Busy queues and provider limits may increase the waiting time.</p></div>}
      {existing && <div className="mt-7 rounded-lg border border-border p-5"><h2 className="font-medium">This website is already registered.</h2><p className="mt-2 text-sm text-text-secondary">{existing.site?.owned ? "You can manage your existing listing from your dashboard." : existing.canClaim ? "If this is your website, verify ownership to manage it." : "A second listing cannot be created for this address."}</p><div className="mt-4 flex flex-wrap gap-3">{existing.site?.owned ? <Link href="/dashboard" className="button-primary">Manage website</Link> : existing.canClaim && existing.site ? <Link href={`/claim?site=${existing.site.id}`} className="button-primary">Claim this website</Link> : null}{existing.site && <Link href={`/site/${existing.site.slug}`} className="button-secondary">View listing</Link>}</div></div>}
    </form>}
    {step === 1 && prepared && <form onSubmit={review}>
      <div className="mb-7 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">Make the listing yours.</h2><p className="mt-1 break-all text-sm text-text-muted">{prepared.url}</p></div><button className="text-sm text-accent underline underline-offset-4" type="button" onClick={reset}>Change URL</button></div>
      {prepared.warnings.map((warning) => <p key={warning} className="mb-4 text-sm text-text-secondary" role="status">{warning}</p>)}
      {prepared.metadata?.canonicalUrl && prepared.metadata.canonicalUrl !== prepared.url && <p className="mb-5 text-xs leading-relaxed text-text-muted">The page declares a canonical URL of <span className="break-all">{prepared.metadata.canonicalUrl}</span>. Your submitted address remains unchanged.</p>}
      <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium">Site name<input className="form-field mt-2" required minLength={2} maxLength={60} value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setBadgeVerified(false); }} /></label><label className="text-sm font-medium">Tagline <span className="font-normal text-text-muted">optional</span><input className="form-field mt-2" maxLength={140} value={draft.tagline} onChange={(event) => setDraft({ ...draft, tagline: event.target.value })} /></label></div>
      <label className="mt-5 block text-sm font-medium">Description<textarea className="form-field mt-2 min-h-28 resize-y" required minLength={10} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /><span className="mt-1 block text-right text-xs font-normal text-text-muted">{draft.description.length}/500</span></label>
      <div className="mt-5 grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium">Primary category<select className="form-field mt-2" value={draft.categoryId} required onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Choose a category</option>{catalog?.categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">Country <span className="font-normal text-text-muted">optional</span><select className="form-field mt-2" value={draft.countryCode} onChange={(event) => setDraft({ ...draft, countryCode: event.target.value })}><option value="">Not specified</option>{catalog?.countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}</select><span className="mt-2 block text-xs font-normal text-text-muted">Choose the website or business location. Hosting location is not used.</span></label></div>
      <fieldset className="mt-7 border-t border-border pt-6"><legend className="float-left mb-4 w-full text-sm font-medium">Technologies <span className="font-normal text-text-muted">review detected suggestions</span></legend><div className="clear-both grid grid-cols-2 gap-3 sm:grid-cols-3">{catalog?.technologies.map((item) => { const detected = prepared.metadata?.technologies.find((entry) => entry.slug === item.slug); return <label key={item.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-accent" checked={draft.technologyIds.includes(item.id)} onChange={(event) => setDraft({ ...draft, technologyIds: event.target.checked ? [...draft.technologyIds, item.id] : draft.technologyIds.filter((id) => id !== item.id) })} /><span>{item.name}{detected && <span className="block text-xs text-text-muted" title={detected.evidence}>Detected on page</span>}</span></label>; })}</div><p className="mt-4 text-xs leading-relaxed text-text-muted">Detection uses visible page and response evidence. It cannot identify every server technology; you can correct these selections.</p></fieldset>
      <label className="mt-7 block text-sm font-medium">Logo or favicon URL <span className="font-normal text-text-muted">optional</span><input className="form-field mt-2" type="url" value={draft.faviconUrl} onChange={(event) => setDraft({ ...draft, faviconUrl: event.target.value })} maxLength={2048} /></label>
      <fieldset className="mt-7 border-t border-border pt-6"><legend className="float-left mb-4 w-full text-sm font-medium">Social links <span className="font-normal text-text-muted">optional</span></legend><div className="clear-both grid gap-4 sm:grid-cols-2">{socialFields.map((field) => <label key={field.id} className="text-xs text-text-secondary">{field.label}<input className="form-field mt-2" type="url" placeholder="https://" maxLength={2048} value={draft.social[field.id] ?? ""} onChange={(event) => setDraft({ ...draft, social: { ...draft.social, [field.id]: event.target.value } })} /></label>)}</div></fieldset>
      <div className="mt-7 border-t border-border pt-6"><p className="text-sm font-medium">Founder</p>{founder ? <label className="mt-3 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-accent" checked={draft.includeFounder} onChange={(event) => setDraft({ ...draft, includeFounder: event.target.checked })} /><span>Link {founder.name}&apos;s founder profile{founder.visibility === "private" && <span className="mt-1 block text-xs text-text-muted">Your profile remains private until you publish it.</span>}</span></label> : <p className="mt-2 text-sm text-text-secondary">You can create and link your founder profile from the <Link className="text-accent underline" href="/dashboard">dashboard</Link> after publishing.</p>}</div>
      <div className="mt-7 grid grid-cols-2 gap-8 border-t border-border divide-x divide-border"><Measurement label="Mobile · two samples" proof={prepared.mobile} /><div className="pl-6"><Measurement label="Desktop · two samples" proof={prepared.desktop} /></div></div><p className="text-xs text-text-muted">Scores are the arithmetic mean of two lab measurements per device. They are not field data and may vary between runs.</p>
      {prepared.hasScreenshot && <PrivatePreview id={prepared.id} />}
      <div className="mt-8 flex flex-wrap justify-between gap-3"><button className="button-secondary" type="button" onClick={reset}>Back to URL</button><button className="button-primary" type="submit">Review publication <ArrowRight size={18} /></button></div>
    </form>}
    {step === 2 && prepared && <div><div className="flex items-center gap-4 border-b border-border pb-6"><GlobeSimple size={32} className="shrink-0 text-accent" /><div><h2 className="text-xl font-semibold">{draft.name}</h2><p className="mt-1 break-all text-sm text-text-muted">{prepared.url}</p></div></div><p className="mt-5 text-text-secondary leading-relaxed">{draft.description}</p><p className="mt-4 text-sm text-text-muted">{catalog?.categories.find((item) => item.id === draft.categoryId)?.name}{draft.countryCode ? ` · ${catalog?.countries.find((country) => country.code === draft.countryCode)?.name}` : ""}</p>
      {user?.isPro && <label className="mt-6 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-accent" checked={draft.listed} onChange={(event) => setDraft({ ...draft, listed: event.target.checked })} /><span>Publish on the public directory<span className="mt-1 block text-xs text-text-muted">Turn this off to save a private listing.</span></span></label>}
      {badgeRequired && <div className="mt-7 border-t border-border pt-6"><h3 className="font-medium">Add your performance badge</h3><p className="mt-2 text-sm leading-relaxed text-text-secondary">Free public listings include a badge linking back to your measured profile. Add this code to the submitted page, then verify it.</p><textarea aria-label="Badge embed code" readOnly value={badgeCode} rows={4} className="form-field mt-4 font-mono text-xs" /><div className="mt-3 flex flex-wrap gap-3"><button className="button-secondary" type="button" onClick={() => void navigator.clipboard.writeText(badgeCode).then(() => setCopied(true)).catch(() => setError("Copy the badge code directly from the field above."))}>{copied ? "Copied" : "Copy code"}</button><button className="button-secondary" type="button" disabled={verifying} onClick={() => void verifyBadge()}>{verifying ? "Checking badge…" : badgeVerified ? "Badge verified" : "Verify badge"}</button></div></div>}
      <p className="mt-7 text-xs leading-relaxed text-text-muted">Publishing uses your verified server measurements. Public listings appear in the directory; future captures and measurements are added when available.</p><div className="mt-7 flex flex-wrap justify-between gap-3"><button className="button-secondary" type="button" disabled={submitting} onClick={() => setStep(1)}>Edit details</button><button className="button-primary" type="button" disabled={submitting || (badgeRequired && !badgeVerified)} onClick={() => void publish()}>{submitting ? <SpinnerGap className="animate-spin" size={18} /> : <Check size={18} />}{submitting ? "Publishing…" : draft.listed ? "Publish website" : "Save private listing"}</button></div></div>}
  </div>;
}
