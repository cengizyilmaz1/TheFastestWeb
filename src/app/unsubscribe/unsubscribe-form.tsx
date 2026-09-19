"use client";
import { useState } from "react";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  async function submit() {
    setState("loading");
    try {
      const response = await fetch("/api/notifications/unsubscribe", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      setState(response.ok ? "done" : "error");
    } catch { setState("error"); }
  }
  return <div className="mt-8">{state === "done" ? <p role="status">You have been unsubscribed from this email category.</p> : <>
    <button type="button" className="button-primary disabled:opacity-50" disabled={!token || state === "loading"} onClick={submit}>
      {state === "loading" ? "Saving…" : "Unsubscribe"}</button>
    {(state === "error" || !token) && <p role="alert" className="mt-4">This link could not be used. You can also update email preferences in your account.</p>}
  </>}</div>;
}
