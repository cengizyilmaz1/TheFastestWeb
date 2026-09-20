import type { Metadata } from "next";
import { Outfit, JetBrains_Mono, Inter } from "next/font/google";
import { Suspense } from "react";
import { Nav } from "@/components/layout/Nav";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import { Sidebar } from "@/components/layout/Sidebar";
import { Footer } from "@/components/layout/Footer";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/db/index";
import { adSlots, adminRoles } from "@/db/schema";
import { eq, and, or, isNull, gt } from "drizzle-orm";
import { siteConfig } from "@/config/site";
import { safeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/seo/metadata";
import { identityGraph } from "@/lib/seo/structured-data";
import ConsentAnalytics from "@/infrastructure/analytics/consent-analytics";
import { getPublicAnalyticsConfig } from "@/infrastructure/analytics/config";
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
  ...pageMetadata({ title: "Website speed rankings", description: SITE_DESCRIPTION, path: "/" }),
  metadataBase: new URL(siteConfig.url),
  title: {
    default: `Website speed rankings | ${siteConfig.name}`,
    template: `%s | ${siteConfig.name}`,
  },
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/favicon/apple-touch-icon.png",
  },
  manifest: "/favicon/site.webmanifest",
  applicationName: siteConfig.name,
  category: "technology",
  referrer: "strict-origin-when-cross-origin",
  verification: { google: process.env.SEARCH_CONSOLE_VERIFICATION || undefined,
    ...(process.env.BING_VERIFICATION ? { other: { "msvalidate.01": process.env.BING_VERIFICATION } } : {}) },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  const db = getDb();
  const [adminGrant] = user && db ? await db.select({ role: adminRoles.role }).from(adminRoles)
    .where(and(eq(adminRoles.userId, user.id), eq(adminRoles.role, "admin"))).limit(1) : [];

  // Fetch active ad slots
  const activeAdSlots = db
    ? await db
        .select({
          id: adSlots.id,
          position: adSlots.position,
          orderIndex: adSlots.orderIndex,
          name: adSlots.name,
          url: adSlots.url,
          tagline: adSlots.tagline,
          faviconUrl: adSlots.faviconUrl,
        })
        .from(adSlots)
        .where(
          and(
            eq(adSlots.isActive, true),
            eq(adSlots.status, "active"),
            or(isNull(adSlots.expiresAt), gt(adSlots.expiresAt, new Date()))
          )
        )
    : [];

  return (
    <html lang="en">
      <body
        className={`${outfit.variable} ${jetbrainsMono.variable} ${inter.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(identityGraph()),
          }}
        />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        <Nav user={user} canManagePayments={adminGrant?.role === "admin"} />
        <div className="grid grid-cols-[190px_1fr_190px] min-h-screen max-[1100px]:grid-cols-[1fr]">
          <Sidebar position="left" count={5} adSlots={activeAdSlots} />
          <main id="main-content" className="col-start-2 min-w-0 pt-[60px] max-[1100px]:col-start-1">
            {children}
            <Footer />
          </main>
          <Sidebar position="right" count={5} adSlots={activeAdSlots} />
        </div>
        <Suspense fallback={null}><ConsentAnalytics config={getPublicAnalyticsConfig()} /></Suspense>
      </body>
    </html>
  );
}
