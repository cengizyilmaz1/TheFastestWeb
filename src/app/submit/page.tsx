import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { Suspense } from "react";
import { SubmitPageForm } from "@/components/submit/SubmitPageForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Submit Your Website | TheFastestWeb",
  description:
    "Submit your website to the TheFastestWeb leaderboard. Free speed testing, daily monitoring, dofollow backlink, and historical performance tracking.",
  alternates: { canonical: `${siteConfig.url}/submit` },
  openGraph: {
    title: "Submit Your Website | TheFastestWeb",
    description: "Submit your website to the TheFastestWeb leaderboard. Free speed testing, daily monitoring, dofollow backlink, and historical performance tracking.",
  },
  twitter: {
    title: "Submit Your Website | TheFastestWeb",
    description: "Submit your website to the TheFastestWeb leaderboard. Free speed testing, daily monitoring, dofollow backlink, and historical performance tracking.",
  },
};

export default async function SubmitPage() {
  const user = await getCurrentUser();

  return (
    <div className="max-w-[540px] mx-auto py-10 px-5">
      <div className="text-center mb-6">
        <h1 className="font-display text-[clamp(1.6rem,3vw,2.1rem)] font-[900] tracking-[-0.02em] mb-2">
          Submit Your Website
        </h1>
        <p className="text-text-secondary text-[0.88rem] max-w-md mx-auto">
          Test your speed, get listed on the leaderboard, and earn a permanent dofollow backlink.
        </p>
      </div>

      <Suspense fallback={null}>
        <SubmitPageForm user={user} siteUrl={siteConfig.url} />
      </Suspense>
    </div>
  );
}
