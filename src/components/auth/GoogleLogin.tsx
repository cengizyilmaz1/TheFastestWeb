"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export function GoogleLogin({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div><button className="button-primary w-full" disabled={busy} type="button" onClick={async () => { setBusy(true); setError(""); try { await signIn("google", { callbackUrl }); } catch { setError("Sign-in could not be started. Please try again."); setBusy(false); } }}>{busy ? "Opening Google…" : "Continue with Google"}</button><p role="status" className="mt-3 text-sm text-red">{error}</p></div>;
}
