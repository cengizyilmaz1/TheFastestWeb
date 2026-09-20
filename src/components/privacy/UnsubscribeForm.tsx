"use client";
import { useState } from "react";

/** Preserve signed email opt-out without adding a page to the original route set. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  async function confirm() {
    setState("saving");
    try {
      const response = await fetch("/api/notifications/unsubscribe", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
      });
      setState(response.ok ? "done" : "error");
    } catch { setState("error"); }
  }
  return <section id="email-preferences" className="mb-10 rounded-[14px] border border-border bg-bg-card p-6">
    <h2 className="font-display text-xl font-bold text-text-primary">Email preferences</h2>
    {state === "done" ? <p role="status" className="mt-3 text-green">You have been unsubscribed from this email category.</p> : <>
      <p className="mt-3 text-sm text-text-secondary">Confirm to stop receiving this category of email. Opening this link does not change your preferences.</p>
      <button type="button" disabled={state === "saving" || !token} onClick={confirm} className="mt-4 rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-bg-deep disabled:opacity-50">{state === "saving" ? "Saving…" : "Unsubscribe"}</button>
      {state === "error" && <p role="alert" className="mt-3 text-sm text-red">The link is invalid or expired. Try the link in a more recent email.</p>}
    </>}
  </section>;
}
