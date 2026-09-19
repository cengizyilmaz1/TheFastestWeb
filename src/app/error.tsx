"use client";
import Link from "next/link";
import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { StatusPage } from "@/components/layout/StatusPage";

export default function ErrorPage({ error, reset }: { error?: Error & { digest?: string }; reset: () => void }) {
  return <StatusPage eyebrow="A short pause" title="This page is taking a moment." description="We could not load the information for this page. Try again, or carry on from the directory while we catch up." reference={error?.digest}
    actions={<><button type="button" onClick={reset} className="button-primary min-h-12 px-6 text-[15px]! font-semibold!"><ArrowClockwiseIcon size={18} weight="bold" aria-hidden />Try again</button><Link href="/explore" className="button-secondary min-h-12 px-6 text-[15px]">Explore websites</Link><Link href="/" className="link-underline text-sm">Back to home</Link></>} />;
}
