"use client";
import { useState } from "react";
import Link from "next/link";
import { CheckCircleIcon, WarningCircleIcon } from "@phosphor-icons/react";

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
  return <section aria-labelledby="unsubscribe-title" className="panel self-start p-7 sm:p-10">
    {state === "done" ? <>
      <CheckCircleIcon size={36} weight="fill" aria-hidden className="text-green" />
      <h2 id="unsubscribe-title" className="mt-5 text-2xl font-semibold tracking-[-.035em] sm:text-[1.75rem]">You are unsubscribed</h2>
      <p role="status" className="mt-3 max-w-[46ch] leading-relaxed text-text-secondary">You have been unsubscribed from this email category.</p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3"><Link href="/explore" className="button-secondary">Explore websites</Link><Link href="/" className="link-underline text-sm">Back to home</Link></div>
    </> : <>
      <h2 id="unsubscribe-title" className="text-2xl font-semibold tracking-[-.035em] sm:text-[1.75rem]">Stop this email category</h2>
      <p className="mt-3 max-w-[46ch] leading-relaxed text-text-secondary">This takes one step. Email preferences can also be changed in your account.</p>
      <button type="button" className="button-primary mt-8 min-h-12 px-6 text-[15px]! font-semibold!" disabled={!token || state === "loading"} onClick={submit}>
        {state === "loading" && <span aria-hidden className="animate-spin size-4 rounded-full border-2 border-current border-r-transparent" />}
        {state === "loading" ? "Saving…" : "Unsubscribe"}</button>
      {(state === "error" || !token) && <div role="alert" className="mt-7 flex gap-3 rounded-2xl bg-red-dim p-4 sm:p-5">
        <WarningCircleIcon size={22} weight="fill" aria-hidden className="mt-0.5 flex-none text-red" />
        <div className="text-[15px] leading-relaxed text-text-primary">
          <p>This link could not be used. You can also update email preferences in your account.</p>
          <Link href="/dashboard" className="link-underline mt-2 inline-block text-sm">Open your dashboard</Link>
        </div>
      </div>}
    </>}
  </section>;
}
