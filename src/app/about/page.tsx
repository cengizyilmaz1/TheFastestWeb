import { siteConfig } from "@/config/site";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | TheFastestWeb",
  description:
    "The story behind TheFastestWeb: why speed matters more than you think, and how a traffic drop taught me that the hard way.",
  alternates: { canonical: `${siteConfig.url}/about` },
  openGraph: {
    title: "About | TheFastestWeb",
    description: "The story behind TheFastestWeb: why speed matters more than you think, and how a traffic drop taught me that the hard way.",
  },
  twitter: {
    title: "About | TheFastestWeb",
    description: "The story behind TheFastestWeb: why speed matters more than you think, and how a traffic drop taught me that the hard way.",
  },
};

export default function AboutPage() {
  return (
    <div className="py-[60px] px-5 pb-[80px]">
      <div className="max-w-[600px] mx-auto">
        {/* Header */}
        <h1 className="font-display text-[clamp(1.8rem,3.5vw,2.4rem)] font-[900] tracking-[-0.03em] mb-3">
          Why I Built{" "}
          <span className="bg-gradient-to-br from-accent-bright via-orange to-accent bg-clip-text text-transparent">
            TheFastestWeb
          </span>
        </h1>
        <p className="text-text-muted text-[0.85rem] mb-10">
          By Ramesh &middot; Founder
        </p>

        {/* Story */}
        <div className="space-y-5 text-text-secondary text-[0.92rem] leading-[1.7]">
          <p>
            A few months ago, I migrated my website{" "}
            <a
              href="https://fixmypdf.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent no-underline hover:underline"
            >
              FixMyPDF
            </a>{" "}
            from vanilla JavaScript to a modern JS framework. The site looked better, the code
            was cleaner, and everything seemed to work perfectly fine. I couldn&apos;t see any visible
            speed issues, so I moved on and didn&apos;t think twice about it.
          </p>

          <p>
            Then, over the next week, my organic traffic started dropping. Quietly at first, from
            100+ daily visits down to 80, then 60, then 40. Within a week, I was getting barely
            20 visits a day. I had no idea what was happening. Nothing had changed on the content
            side. No algorithm update that I knew of. Just a slow, steady decline that felt
            impossible to explain.
          </p>

          <p>
            Out of desperation, I finally checked my Core Web Vitals. That&apos;s when I saw it:
            my performance scores had dropped drastically after the migration. The site that
            &ldquo;looked fast&rdquo; was actually much slower under the hood. Larger bundles,
            render-blocking scripts, layout shifts I couldn&apos;t see with my eyes but Google
            could measure with precision.
          </p>

          <p>
            I sat down and spent a full day fixing the performance issues. Optimized the bundle,
            lazy-loaded what I could, fixed the layout shifts. The scores went back up, and over
            the next couple of weeks, the traffic slowly recovered.
          </p>

          <div className="bg-bg-card border border-border rounded-[12px] px-5 py-4 my-8">
            <p className="text-text-primary font-semibold text-[0.95rem] mb-2">
              The lesson was clear:
            </p>
            <p className="text-text-secondary text-[0.88rem] leading-[1.65] m-0">
              Speed isn&apos;t just a number on a Lighthouse report. It directly affects your
              search rankings, your traffic, and your business. And the scary part is, you might
              not even notice the problem until the damage is done.
            </p>
          </div>

          <p>
            That experience is exactly why I built TheFastestWeb. I wanted a simple tool that
            tracks website speed over time and alerts you when something goes wrong, before
            you lose traffic over it. No complicated dashboards. No enterprise pricing. Just
            submit your site, and we&apos;ll keep an eye on your performance score every single
            day.
          </p>

          <p>
            If your speed drops, you&apos;ll know about it immediately. If it stays fast,
            you get to show it off on the leaderboard and earn a backlink while you&apos;re at it.
          </p>

          <p className="text-text-muted text-[0.85rem] pt-3">
            That&apos;s it. That&apos;s the whole story. If you care about your website&apos;s
            performance, I built this for you.
          </p>
        </div>

        {/* CTA */}
        <div className="mt-10 pt-8 border-t border-border flex flex-col items-center gap-4">
          <Link
            href="/submit"
            className="inline-block px-7 py-3 rounded-[10px] bg-gradient-to-br from-accent to-accent-bright text-bg-deep font-bold text-[0.92rem] no-underline transition-all duration-200 hover:-translate-y-px hover:shadow-[0_0_25px_var(--color-accent-glow)]"
          >
            Submit Your Site
          </Link>
          <p className="text-text-muted text-[0.8rem]">
            Questions?{" "}
            <a
              href="mailto:thefastestwebsite@gmail.com"
              className="text-accent no-underline hover:underline"
            >
              thefastestwebsite@gmail.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
