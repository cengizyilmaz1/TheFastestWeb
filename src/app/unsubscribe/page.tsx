import type { Metadata } from "next";
import UnsubscribeForm from "./unsubscribe-form";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <h1 className="page-title">Email preferences</h1>
    <div className="mt-8 grid gap-x-16 gap-y-10 sm:mt-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <p className="max-w-[40ch] text-lg leading-relaxed text-text-secondary sm:text-xl">Unsubscribe from the category linked in your email. Essential account and payment messages remain enabled.</p>
        <dl className="mt-10 max-w-[30rem] text-[15px]">
          <div className="grid gap-x-8 gap-y-1 border-t border-border py-4 sm:grid-cols-[8rem_minmax(0,1fr)]"><dt className="text-text-muted">Turns off</dt><dd className="font-medium text-text-primary">The email category linked in your message</dd></div>
          <div className="grid gap-x-8 gap-y-1 border-y border-border py-4 sm:grid-cols-[8rem_minmax(0,1fr)]"><dt className="text-text-muted">Stays on</dt><dd className="font-medium text-text-primary">Essential account and payment messages</dd></div>
        </dl>
      </div>
      <UnsubscribeForm token={typeof token === "string" && token.length <= 1024 ? token : ""} />
    </div>
  </div>;
}
