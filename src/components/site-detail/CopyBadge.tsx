"use client";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

export function CopyBadge({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  async function copy() { try { await navigator.clipboard.writeText(code); setStatus("Copied to clipboard."); } catch { setStatus("Select the code below and copy it manually."); } }
  const copied = status === "Copied to clipboard.";
  return <div className="panel-quiet grid gap-x-14 gap-y-8 p-6 sm:p-10 lg:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)] lg:items-center">
    <div>
      <h2 className="section-title">Share your performance</h2>
      <p className="mt-4 max-w-[44ch] leading-relaxed text-text-secondary">The badge links back to this report and reflects your recorded score.</p>
      <button className="button-ink mt-7 text-sm! font-semibold!" onClick={copy} type="button">{copied ? <CheckIcon size={16} weight="bold" aria-hidden /> : <CopyIcon size={16} weight="bold" aria-hidden />}Copy embed</button>
      <p aria-live="polite" className="mt-3 min-h-5 text-[13px] text-text-secondary">{status}</p>
    </div>
    <div className="min-w-0">
      <p className="mb-2.5 text-[13px] font-medium text-text-secondary">Embed code</p>
      <pre tabIndex={0} aria-label="Badge embed code" className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border bg-bg-main p-4 text-[13px] leading-relaxed text-text-secondary sm:p-5"><code>{code}</code></pre>
    </div>
  </div>;
}
