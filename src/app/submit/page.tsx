import { pageMetadata } from "@/lib/seo/metadata";
import { Suspense } from "react";
import { SubmitPageForm } from "@/components/submit/SubmitPageForm";
import { getCurrentUser } from "@/lib/auth";
import { hasAccountProAccess } from "@/modules/payments/entitlements";
import { AdSuccessBanner } from "@/components/ads/AdSuccessBanner";

export const metadata = pageMetadata({
  "title": "Submit your website",
  "description": "Add your website to TheFastestWeb. Sign in, verify its performance and choose whether to publish a public leaderboard listing.",
  "path": "/submit"
});

export default async function SubmitPage() {
  const user = await getCurrentUser();
  const publicUser = user ? { name: user.name, avatarUrl: user.avatarUrl, twitterHandle: user.twitterHandle, isPro: await hasAccountProAccess(user.id, user.isPro) } : null;

  return (
    <div className="max-w-[540px] mx-auto py-10 px-5">
      <div className="text-center mb-6">
        <h1 className="font-display text-[clamp(1.6rem,3vw,2.1rem)] font-[900] tracking-[-0.02em] mb-2">
          Submit Your Website
        </h1>
        <p className="text-text-secondary text-[0.88rem] max-w-md mx-auto">
          Test your speed, join the leaderboard, and get a dofollow link on your public listing.
        </p>
      </div>

      <Suspense fallback={null}>
        <AdSuccessBanner />
        <SubmitPageForm user={publicUser} />
      </Suspense>
    </div>
  );
}
