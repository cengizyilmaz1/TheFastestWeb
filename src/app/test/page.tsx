import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { TestForm } from "@/components/speed-test/TestForm";

export const metadata: Metadata = {
  title: "Test Your Website Speed | TheFastestWeb",
  description:
    "Measure a public website with two Google PageSpeed Insights lab samples on mobile or desktop.",
  alternates: { canonical: `${siteConfig.url}/test` },
  openGraph: {
    title: "Test Your Website Speed | TheFastestWeb",
    description: "Compare real mobile or desktop lab measurements from two PageSpeed Insights samples.",
  },
  twitter: {
    title: "Test Your Website Speed | TheFastestWeb",
    description: "Compare real mobile or desktop lab measurements from two PageSpeed Insights samples.",
  },
};

export default function TestPage() {
  return <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14"><header className="mb-10"><p className="page-eyebrow mb-4">Measure before you improve</p><h1 className="page-title">See how your website performs.</h1><p className="page-description mt-4">Start with a real measurement. Understand what renders quickly, what blocks interaction, and where to focus next.</p></header><TestForm /></div>;
}
