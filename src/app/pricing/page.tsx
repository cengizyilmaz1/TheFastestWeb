import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import type { Metadata } from "next";
import { PricingTiers } from "@/components/pricing/PricingTiers";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing | TheFastestWeb",
  description:
    "Submit your site for free. Existing Pro memberships remain active; new upgrades and advertising purchases are temporarily unavailable.",
  alternates: { canonical: `${siteConfig.url}/pricing` },
  openGraph: {
    title: "Pricing | TheFastestWeb",
    description: "Submit your site for free. Existing Pro memberships remain active; new upgrades and advertising purchases are temporarily unavailable.",
  },
  twitter: {
    title: "Pricing | TheFastestWeb",
    description: "Submit your site for free. Existing Pro memberships remain active; new upgrades and advertising purchases are temporarily unavailable.",
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
        text: "Existing Pro members retain unlimited site submissions, dofollow backlinks, and listings without a badge requirement. New upgrades are temporarily unavailable.",
      },
    },
    {
      "@type": "Question",
      name: "Can I upgrade to Pro now?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "New Pro upgrades are temporarily unavailable. Existing Pro plans remain active.",
      },
    },
    {
      "@type": "Question",
      name: "What is an ad slot?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Ad slots are featured sponsor placements in the sidebar of TheFastestWeb. New advertising purchases are temporarily unavailable.",
      },
    },
    {
      "@type": "Question",
      name: "How is my website speed score calculated?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The score comes from one mobile lab test run by Google PageSpeed Insights. We retain the reported Lighthouse score and metrics; lab conditions can vary between measurements.",
      },
    },
  ],
};

export default async function PricingPage() {
  const user = await getCurrentUser();

  return (
    <div className="py-[60px] px-5 pb-[80px]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <div className="text-center mb-12">
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.6rem)] font-[900] tracking-[-0.03em] mb-3">
          Simple,{" "}
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            Transparent
          </span>{" "}
          Pricing
        </h1>
        <p className="text-text-secondary text-[0.95rem] max-w-[460px] mx-auto">
          Start with a free website listing and a mobile PageSpeed measurement.
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
