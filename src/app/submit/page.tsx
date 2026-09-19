import { siteConfig } from "@/config/site";
import { Metadata } from "next";
import { Suspense } from "react";
import { SubmitPageForm } from "@/components/submit/SubmitPageForm";
import { getCurrentUser } from "@/lib/auth";
import { getCatalog } from "@/modules/catalog/service";
import { getOwnFounder } from "@/modules/founders/service";
import { hasAccountProAccess } from "@/modules/payments/entitlements";

export const metadata: Metadata = {
  title: "Submit Your Website | TheFastestWeb",
  description:
    "Prepare your website details, review mobile and desktop lab measurements, and publish your performance profile.",
  alternates: { canonical: `${siteConfig.url}/submit` },
  openGraph: {
    title: "Submit Your Website | TheFastestWeb",
    description: "Review your website details and real mobile and desktop measurements before publishing.",
  },
  twitter: {
    title: "Submit Your Website | TheFastestWeb",
    description: "Review your website details and real mobile and desktop measurements before publishing.",
  },
};

export default async function SubmitPage() {
  const user = await getCurrentUser();
  const submissionUser = user ? { id: user.id, name: user.name, isPro: await hasAccountProAccess(user.id, user.isPro) } : null;
  const [catalogResult, founderResult] = await Promise.allSettled([getCatalog(), user ? getOwnFounder(user.id) : Promise.resolve(null)]);
  const catalog = catalogResult.status === "fulfilled" ? catalogResult.value : null;
  const founder = founderResult.status === "fulfilled" && founderResult.value ? {
    id: founderResult.value.id, name: founderResult.value.name, visibility: founderResult.value.visibility,
  } : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="mb-10">
        <p className="page-eyebrow mb-4">A place for your work</p>
        <h1 className="page-title">
          Put your website on the map.
        </h1>
        <p className="page-description mt-4">
          Start with a URL. Review your details and real measurements, then share your website with the community.
        </p>
      </div>

      <Suspense fallback={null}>
        <SubmitPageForm user={submissionUser} siteUrl={siteConfig.url} catalog={catalog} founder={founder} />
      </Suspense>
    </div>
  );
}
