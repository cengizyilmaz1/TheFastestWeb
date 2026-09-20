"use client";
import { useState } from "react";
export function UsernameEditor({ username }: { username: string }) {
  const [value, setValue] = useState(username), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="mb-6 rounded-[10px] border border-border bg-bg-card p-4" onSubmit={async event => {
    event.preventDefault(); if (busy || value === username) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/founders/username", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: value, expectedUsername: username, requestId: crypto.randomUUID() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "Unable to save your username.");
      location.assign(result.path);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save your username."); setBusy(false); }
  }}>
    <label htmlFor="founder-username" className="block text-sm font-semibold">Your profile address</label>
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-secondary">/founder/</span>
      <input id="founder-username" value={value} onChange={event => setValue(event.target.value.toLowerCase())} required minLength={2} maxLength={80}
        pattern="[a-z0-9]+(-[a-z0-9]+)*" autoComplete="off" className="min-w-0 rounded-lg border border-border bg-bg-main px-3 py-2 text-sm" />
      <button disabled={busy || value === username} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg-deep disabled:opacity-50">{busy ? "Saving…" : "Save username"}</button>
    </div>
    <p className="mt-2 text-xs text-text-secondary">Use lowercase letters, numbers and hyphens. Your previous address will redirect here. Changing your username does not publish a private profile.</p>
    {error && <p role="alert" className="mt-2 text-sm text-red">{error}</p>}
  </form>;
}

