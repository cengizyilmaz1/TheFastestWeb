import type { Metadata } from "next";
import UnsubscribeForm from "./unsubscribe-form";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className="mx-auto max-w-xl px-6 py-24"><h1 className="text-3xl font-semibold">Email preferences</h1>
    <p className="mt-4 text-text-secondary">Unsubscribe from the category linked in your email. Essential account and payment messages remain enabled.</p>
    <UnsubscribeForm token={typeof token === "string" && token.length <= 1024 ? token : ""} /></main>;
}
