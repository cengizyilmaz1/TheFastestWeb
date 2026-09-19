"use client";

import { useState } from "react";
import { CheckIcon, ShareNetworkIcon } from "@phosphor-icons/react";

export function ShareArticle({ title, url }: { title: string; url: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true); setMessage("");
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        setMessage("Share options closed.");
      } else {
        await navigator.clipboard.writeText(url);
        setMessage("Article link copied.");
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setMessage("Sharing is unavailable. Copy the article address from your browser.");
    } finally { setBusy(false); }
  }
  const copied = message === "Article link copied.";
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:flex-col lg:items-start">
    <button type="button" className="button-secondary text-sm! font-semibold!" onClick={share} disabled={busy}>{copied ? <CheckIcon aria-hidden size={17} weight="bold" className="text-green" /> : <ShareNetworkIcon aria-hidden size={17} />}Share article</button>
    <span role="status" className="min-h-5 max-w-[30ch] text-[13px] leading-snug text-text-secondary">{message}</span>
  </div>;
}
