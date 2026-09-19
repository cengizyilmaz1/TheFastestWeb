"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { GoogleLogoIcon } from "@phosphor-icons/react";
export function GoogleLogin({ callbackUrl }: { callbackUrl: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <div>
    <button className="button-secondary min-h-12 w-full gap-3 px-6 text-[15px]" disabled={busy} type="button" onClick={async () => { setBusy(true); setError(""); try { await signIn("google", { callbackUrl }); } catch { setError("Sign-in could not be started. Please try again."); setBusy(false); } }}>
      <GoogleLogoIcon size={20} weight="bold" aria-hidden />{busy ? "Opening Google…" : "Continue with Google"}
    </button>
    <p role="status" className="text-sm text-red not-empty:mt-3">{error}</p>
  </div>;
}
