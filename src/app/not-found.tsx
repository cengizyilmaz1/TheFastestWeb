import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/layout/StatusPage";

export const metadata: Metadata = { title: "Page not found" };

/** Root not-found: rendered inside the root layout for notFound() calls and for any unmatched URL. */
export default function NotFound() {
  return <StatusPage code="404" title="This page is not on the board." description="The address may be mistyped, or the page may have moved. The directory and the home page are a good place to pick up again."
    actions={<><Link href="/explore" className="button-primary min-h-12 px-6 text-[15px]">Explore websites</Link><Link href="/" className="button-secondary min-h-12 px-6 text-[15px]">Back to home</Link></>} />;
}
