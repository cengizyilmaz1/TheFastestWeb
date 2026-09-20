import type { PerformanceResult } from "@/modules/performance/service";
import { isCountryCode } from "@/modules/catalog/countries";

type Preparation = {
  id: string;
  status: string;
  metadata: { title?: string; description?: string } | null;
  duplicate?: { existing: true } | null;
  mobile: { id: string; result: PerformanceResult; expiresAt: string } | null;
  desktop: { id: string; result: PerformanceResult; expiresAt: string } | null;
};
type PublicationFields = {
  url: string;
  name: string;
  description: string;
  twitterHandle?: string;
  category?: string;
  countryCode: string;
  faviconUrl?: string;
  isListed: boolean;
};

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The request could not be completed. Please try again.");
  return data as T;
}

/** Original form presentation, backed by the current server-owned receipts. */
export async function prepareWebsite(url: string): Promise<Preparation & { mobile: NonNullable<Preparation["mobile"]>; desktop: NonNullable<Preparation["desktop"]> }> {
  const signal = AbortSignal.timeout(240_000);
  const started = await readResponse<{ jobId?: string; existing?: boolean }>(await fetch("/api/submissions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal,
  }));
  if (started.existing) throw new Error("This website is already listed. Open its existing report.");
  if (!started.jobId || !/^[a-f0-9-]{36}$/i.test(started.jobId)) throw new Error("The preparation request could not be started.");
  for (let attempt = 0; attempt < 100; attempt++) {
    signal.throwIfAborted();
    const preparation = await readResponse<Preparation>(await fetch("/api/submissions/" + started.jobId, { cache: "no-store", signal }));
    if (preparation.duplicate) throw new Error("This website is already listed. Open its existing report.");
    if (preparation.status === "succeeded") {
      if (!preparation.mobile || !preparation.desktop) throw new Error("The measurement expired. Test your website again.");
      return { ...preparation, mobile: preparation.mobile, desktop: preparation.desktop };
    }
    if (["failed", "cancelled", "dead"].includes(preparation.status)) throw new Error("The website could not be measured. Please try again.");
    await new Promise((resolve) => setTimeout(resolve, 2400));
  }
  throw new Error("Your measurement is still being processed. Please try again shortly.");
}

export async function publishWebsite(input: PublicationFields): Promise<Response> {
  if (!isCountryCode(input.countryCode)) throw new Error("Choose your product's country of origin.");
  // A preparation can be reused by the server, but a score from browser storage
  // or an old checkout query parameter is never evidence for publication.
  const prepared = await prepareWebsite(input.url);
  return fetch("/api/submit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: input.url, name: input.name, description: input.description,
      twitterHandle: input.twitterHandle, category: input.category || "other",
      countryCode: input.countryCode,
      faviconUrl: input.faviconUrl, isListed: input.isListed,
      preparationId: prepared.id, testResultId: prepared.mobile.id, desktopTestResultId: prepared.desktop.id,
    }),
    signal: AbortSignal.timeout(90_000),
  });
}
