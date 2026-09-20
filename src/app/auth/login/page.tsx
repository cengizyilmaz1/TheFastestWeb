"use client";

import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getProviders().then((providers) => { if (active) setAvailable(Boolean(providers?.google)); })
      .catch(() => { if (active) setAvailable(false); });
    return () => { active = false; };
  }, []);
  async function login() {
    if (!available || busy) return;
    setBusy(true);
    setError("");
    const requested = new URLSearchParams(window.location.search).get("returnTo");
    const callbackUrl = requested?.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") ? requested : "/";
    try { await signIn("google", { callbackUrl }); }
    catch { setError("Sign-in could not be started. Please try again."); setBusy(false); }
  }
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-120px)]">
      <div className="bg-bg-main border border-border rounded-[14px] p-8 max-w-[400px] w-full">
        <h1 className="font-display font-[800] text-2xl mb-2 text-center">
          Sign In
        </h1>
        <p className="text-text-secondary text-sm text-center mb-6">
          Sign in to submit and manage your sites
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={login}
            disabled={!available || busy}
            className="w-full py-3 rounded-[10px] bg-bg-card border border-border text-text-primary font-semibold text-sm cursor-pointer transition-all duration-200 hover:bg-bg-card-hover hover:border-border-light"
          >
            {busy ? "Opening Google…" : "Continue with Google"}
          </button>
          {available === false && <p role="status" className="text-text-secondary text-sm text-center">Sign-in is temporarily unavailable.</p>}
          {error && <p role="alert" className="text-text-secondary text-sm text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
