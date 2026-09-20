import { pageMetadata } from "@/lib/seo/metadata";
import { LegalPage } from "@/components/content/LegalPage";
import { publicPages } from "@/content/public-pages";

const page = publicPages.terms;
export const metadata = pageMetadata({ title: page.title, description: page.description, path: page.path });

export default function TermsPage() {
  return <LegalPage page={page} />;
}
