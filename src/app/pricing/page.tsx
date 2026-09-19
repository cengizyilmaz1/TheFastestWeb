import type { Metadata } from "next";
import { PricingTiers } from "@/components/pricing/PricingTiers";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing | TheFastestWeb",
  description:
    "Submit your site for free, upgrade for unlimited listings, or get a featured ad slot with daily email mentions.",
  alternates: { canonical: "https://thefastestweb.site/pricing" },
  openGraph: {
    title: "Pricing | TheFastestWeb",
    description: "Submit your site for free, upgrade for unlimited listings, or get a featured ad slot with daily email mentions.",
  },
  twitter: {
    title: "Pricing | TheFastestWeb",
    description: "Submit your site for free, upgrade for unlimited listings, or get a featured ad slot with daily email mentions.",
  },
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is TheFastestWeb free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. You can submit one website for free and get daily speed monitoring, a public leaderboard listing, and score history tracking at no cost.",
      },
    },
    {
      "@type": "Question",
      name: "What does the Pro plan include?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pro is a one-time $9 payment. It gives you unlimited site submissions, dofollow backlinks on all your listings, and priority support.",
      },
    },
    {
      "@type": "Question",
      name: "Is the Pro upgrade a subscription?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "No. Pro is a one-time payment of $9 — no recurring charges, no subscriptions.",
      },
    },
    {
      "@type": "Question",
      name: "What is an ad slot?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Ad slots are featured sponsor placements in the sidebar of TheFastestWeb, visible to all visitors. They renew monthly at $19/month and include your site name, tagline, and favicon.",
      },
    },
    {
      "@type": "Question",
      name: "How is my website speed score calculated?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Scores are calculated using Google PageSpeed Insights (Lighthouse v10). The composite score is weighted: TBT 30%, LCP 25%, CLS 25%, FCP 10%, and Speed Index 10%.",
      },
    },
  ],
};

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <div className="py-[60px] px-5 pb-[80px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="text-center mb-12">
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-[900] tracking-[-0.03em] mb-3">
          Simple,{" "}
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            Transparent
          </span>{" "}
          Pricing
        </h1>
        <p className="text-text-secondary text-[0.95rem] max-w-[460px] mx-auto">
          Start free. Upgrade when you need more. No subscriptions for site
          listings — pay once and you&apos;re set.
        </p>
      </div>

      <PricingTiers isPro={user?.isPro ?? false} />

      <div className="text-center mt-10 text-text-muted text-[0.8rem]">
        Questions?{" "}
        <a
          href="mailto:thefastestwebsite@gmail.com"
          className="text-accent no-underline hover:underline"
        >
          thefastestwebsite@gmail.com
        </a>
      </div>
    </div>
  );
}
