import { Metadata } from "next";
import { TestForm } from "@/components/speed-test/TestForm";

export const metadata: Metadata = {
  title: "Test Your Website Speed | TheFastestWeb",
  description:
    "Enter any URL to get a real website performance score. Free, instant results.",
  alternates: { canonical: "https://thefastestweb.site/test" },
  openGraph: {
    title: "Test Your Website Speed | TheFastestWeb",
    description: "Enter any URL to get a real website performance score. Free, instant results.",
  },
  twitter: {
    title: "Test Your Website Speed | TheFastestWeb",
    description: "Enter any URL to get a real website performance score. Free, instant results.",
  },
};

export default function TestPage() {
  return <TestForm />;
}
