import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { listDirectory } from "@/modules/sites/directory";
import { comparisonPair } from "@/modules/compare/model";

export const metadata: Metadata = { title: "Compare website performance", description: "Compare recorded lab performance, measurement history and technologies for two public websites.", alternates: { canonical: "/compare" }, robots: { index: false, follow: true } };
export default async function ComparePage({ searchParams }: { searchParams: Promise<{ left?: string; right?: string }> }) {
  const query = await searchParams, pair = comparisonPair(query.left ?? "", query.right ?? "");
  if (pair) redirect(`/compare/${pair}`);
  const examples = await listDirectory({ limit: 48, sort: "score" });
  return <div className="page-shell mx-auto max-w-[960px]"><p className="page-eyebrow">Measured side by side</p><h1 className="page-title mt-4">Compare two websites.</h1><p className="page-description mt-5">Use public website slugs to compare the same device and measurement method. Missing measurements stay missing; rankings remain independent of this comparison.</p>
    <form className="mt-10 grid items-end gap-5 sm:grid-cols-2" action="/compare"><label className="text-sm">First website slug<input className="form-field mt-2" name="left" list="comparison-websites" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} defaultValue={query.left ?? ""} placeholder="website-slug" /></label>
      <label className="text-sm">Second website slug<input className="form-field mt-2" name="right" list="comparison-websites" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={200} defaultValue={query.right ?? ""} placeholder="another-website" /></label>
      <datalist id="comparison-websites">{examples.sites.map((site) => <option key={site.id} value={site.slug}>{site.name}</option>)}</datalist>
      {query.left && query.right && !pair && <p className="text-sm text-red sm:col-span-2" role="alert">Choose two different valid website slugs.</p>}
      <button className="button-primary justify-self-start" type="submit">Compare websites</button>
    </form><p className="mt-5 text-xs text-text-muted">Suggestions include up to 48 public websites. You can enter any public website slug from its TheFastestWeb report URL.</p>
  </div>;
}
