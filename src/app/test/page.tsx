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
  return <div className="mx-auto max-w-[1240px] px-5 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20">
    <header className="mb-10 sm:mb-14">
      <h1 className="page-title max-w-[16ch]">See how your website performs.</h1>
      <p className="page-description mt-6 sm:text-lg">Start with a real measurement. Understand what renders quickly, what blocks interaction, and where to focus next.</p>
    </header>
    <TestForm />
  </div>;
}
