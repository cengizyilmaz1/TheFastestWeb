"use client";
import { useState } from "react";
export function CopyBadge({ code }: { code: string }) {
  const [status, setStatus] = useState("");
  async function copy() { try { await navigator.clipboard.writeText(code); setStatus("Copied to clipboard."); } catch { setStatus("Select the code below and copy it manually."); } }
  return <div><div className="flex items-center justify-between gap-4"><h3 className="font-medium">Share your performance</h3><button className="button-secondary" onClick={copy} type="button">Copy embed</button></div><p className="mt-2 text-xs text-text-muted">The badge links back to this report and reflects your recorded score.</p><pre tabIndex={0} aria-label="Badge embed code" className="mt-4 overflow-x-auto rounded-lg border border-border bg-bg-main p-4 text-xs text-text-secondary"><code>{code}</code></pre><p aria-live="polite" className="mt-2 text-xs text-text-secondary">{status}</p></div>;
}
