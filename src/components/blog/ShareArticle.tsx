"use client";

import { useState } from "react";
import { ShareNetworkIcon } from "@phosphor-icons/react";

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
  return <div className="flex flex-wrap items-center gap-3"><button type="button" className="button-secondary" onClick={share} disabled={busy}><ShareNetworkIcon aria-hidden size={17} />Share article</button><span role="status" className="text-sm text-text-muted">{message}</span></div>;
}
