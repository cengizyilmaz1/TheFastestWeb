import type { Metadata } from "next";
import { Mona_Sans, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/layout/Nav";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { getCurrentUser } from "@/lib/auth";
import { hasAccountProAccess } from "@/modules/payments/entitlements";
import { getDb } from "@/db/index";
import { adSlots } from "@/db/schema";
import { eq, and, or, isNull, gt, sql } from "drizzle-orm";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { siteConfig } from "@/config/site";
import ConsentAnalytics from "@/infrastructure/analytics/consent-analytics";
import { getPublicAnalyticsConfig } from "@/infrastructure/analytics/config";
import "./globals.css";

// The width axis carries the display voice: headlines run expanded, body copy stays at normal width.
const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
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
  verification: {
    google: process.env.SEARCH_CONSOLE_VERIFICATION || undefined,
    ...(process.env.BING_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_VERIFICATION } } : {}),
  },
  openGraph: {
    title: "TheFastestWeb: Speed Rankings for the Web",
    description:
      "Discover, benchmark, and showcase the world's fastest websites.",
    type: "website",
    siteName: "TheFastestWeb",
    url: siteConfig.url,
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
  const navigationUser = user ? { ...user, isPro: await hasAccountProAccess(user.id, user.isPro) } : null;

  const db = getDb();

  // Fetch active ad slots
  const activeAdSlots = db
    ? await db
        .select()
        .from(adSlots)
        .where(
          and(
            eq(adSlots.isActive, true),
            eq(adSlots.status, "active"),
            or(isNull(adSlots.expiresAt), gt(adSlots.expiresAt, sql`now()`))
          )
        ).catch(() => [])
    : [];

  return (
    <html lang="en" className={`${monaSans.variable} ${geistMono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('tfw-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{}" }} /></head>
      <body className="antialiased">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${siteConfig.url}/#website`,
                  name: "TheFastestWeb",
                  url: siteConfig.url,
                  description: "Speed rankings for the web. Discover, benchmark, and showcase the world's fastest websites.",
                  potentialAction: {
                    "@type": "SearchAction",
                    target: `${siteConfig.url}/explore?q={search_term_string}`,
                    "query-input": "required name=search_term_string",
                  },
                },
                {
                  "@type": "Organization",
                  "@id": `${siteConfig.url}/#organization`,
                  name: "TheFastestWeb",
                  url: siteConfig.url,
                  logo: `${siteConfig.url}/favicon/favicon-96x96.png`,
                },
              ],
            }),
          }}
        />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {siteConfig.isDemo && <div className="border-b border-border bg-bg-main px-5 py-2 text-center text-xs text-text-secondary"><span className="mr-2 font-semibold text-text-primary">Demo preview</span>Payments, email delivery and scheduled monitoring are disabled.</div>}
        <Nav user={navigationUser} />
        <div className="mx-auto grid min-h-[70dvh] max-w-[1600px] grid-cols-1 2xl:grid-cols-[204px_minmax(0,1fr)_204px]">
          <Sidebar position="left" adSlots={activeAdSlots} />
          <main id="main-content" tabIndex={-1} className="min-w-0">{children}</main>
          <Sidebar position="right" adSlots={activeAdSlots} />
        </div>
        <Footer />
        <Suspense fallback={null}><ConsentAnalytics config={getPublicAnalyticsConfig()} /></Suspense>
      </body>
    </html>
  );
}
