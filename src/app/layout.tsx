import type { Metadata } from "next";
import { Outfit, JetBrains_Mono, Inter } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/layout/Nav";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db/index";
import { adSlots, users, sites } from "@/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://thefastestweb.site"),
  title: {
    default: "TheFastestWeb: Speed Rankings for the Web",
    template: "%s | TheFastestWeb",
  },
  description:
    "Discover, benchmark, and showcase the world's fastest websites. Submit yours and prove you belong on the leaderboard.",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
  openGraph: {
    title: "TheFastestWeb: Speed Rankings for the Web",
    description:
      "Discover, benchmark, and showcase the world's fastest websites.",
    type: "website",
    siteName: "TheFastestWeb",
    url: "https://thefastestweb.site",
    images: [{ url: "/og.png", width: 1536, height: 1024, alt: "TheFastestWeb: How Fast Is Your Website?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TheFastestWeb: Speed Rankings for the Web",
    description:
      "Discover, benchmark, and showcase the world's fastest websites.",
    images: ["/og.png"],
  },
  keywords: [
    "website speed test",
    "PageSpeed score",
    "Core Web Vitals",
    "fastest websites",
    "website performance ranking",
    "website speed leaderboard",
    "Lighthouse score",
    "web performance benchmark",
    "site speed checker",
    "website speed monitoring",
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  const db = getDb();

  // Update lastActiveAt for free users at most once per 12 hours (server-side, ad-blocker-proof)
  // Also un-pause any sites that were paused due to inactivity — user is back.
  if (db && user && !user.isPro) {
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    if (!user.lastActiveAt || user.lastActiveAt < twelveHoursAgo) {
      await db
        .update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, user.id));
      await db
        .update(sites)
        .set({ monitoringPaused: false })
        .where(and(eq(sites.ownerId, user.id), eq(sites.monitoringPaused, true)));
    }
  }

  // Fetch active ad slots
  const activeAdSlots = db
    ? await db
        .select()
        .from(adSlots)
        .where(
          and(
            eq(adSlots.isActive, true),
            or(isNull(adSlots.expiresAt), gt(adSlots.expiresAt, new Date()))
          )
        )
    : [];

  return (
    <html lang="en">
      <head>
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-SR10Q81EM3" />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-SR10Q81EM3');`,
          }}
        />
        <script defer src="https://cloud.umami.is/script.js" data-website-id="a7e6c2ca-de08-4c86-94ed-fe0f83f4c776" />
      </head>
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} ${inter.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": "https://thefastestweb.site/#website",
                  name: "TheFastestWeb",
                  url: "https://thefastestweb.site",
                  description: "Speed rankings for the web. Discover, benchmark, and showcase the world's fastest websites.",
                  potentialAction: {
                    "@type": "SearchAction",
                    target: "https://thefastestweb.site/?q={search_term_string}",
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "Organization",
                  "@id": "https://thefastestweb.site/#organization",
                  name: "TheFastestWeb",
                  url: "https://thefastestweb.site",
                  logo: "https://thefastestweb.site/favicon/favicon-96x96.png",
                  founder: {
                    "@type": "Person",
                    name: "Ramesh Kumar",
                    url: "https://x.com/ramesh_mkumar",
                  },
                  sameAs: [
                    "https://x.com/thefastestweb",
                  ],
                },
              ],
            }),
          }}
        />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Nav user={user} />
        <div className="grid grid-cols-[190px_1fr_190px] min-h-screen max-[1100px]:grid-cols-[1fr]">
          <Sidebar position="left" count={5} adSlots={activeAdSlots} />
          <div className="col-start-2 min-w-0 pt-[60px] max-[1100px]:col-start-1">
            {children}
            <Footer />
          </div>
          <Sidebar position="right" count={5} adSlots={activeAdSlots} />
        </div>
      </body>
    </html>
  );
}
