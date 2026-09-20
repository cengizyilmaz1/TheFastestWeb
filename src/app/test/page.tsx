import { pageMetadata } from "@/lib/seo/metadata";
import { TestForm } from "@/components/speed-test/TestForm";

export const metadata = pageMetadata({
  "title": "Test your website speed",
  "description": "Measure website performance with PageSpeed Insights lab results. Review loading, responsiveness and layout stability metrics.",
  "path": "/test"
});

export default function TestPage() {
  return <TestForm />;
}
