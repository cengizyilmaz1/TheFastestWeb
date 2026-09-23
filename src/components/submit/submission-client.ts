import type { PerformanceResult } from "@/modules/performance/service";
import { listingDetailsSchema } from "@/modules/sites/listing-fields";
import type { SiteMetadata } from "@/modules/sites/metadata";

type Preparation = {
  id: string;
  status: string;
  metadata: Partial<SiteMetadata> | null;
  duplicate?: { existing: true } | null;
  mobile: { id: string; result: PerformanceResult; expiresAt: string } | null;
  desktop: { id: string; result: PerformanceResult; expiresAt: string } | null;
};
type PublicationFields = {
  url: string;
  name: string;
  description: string;
  twitterHandle?: string;
  category: string;
  countryCode: string;
  faviconUrl?: string;
  isListed: boolean;
};

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "The request could not be completed. Please try again.");
  return data as T;
}

function preparationStatus(preparation: Pick<Preparation, "status" | "mobile" | "desktop">): string {
  if (preparation.mobile && preparation.desktop) return preparation.status === "succeeded"
    ? "Mobile and desktop measurements are ready." : "Both device measurements are ready. Finishing website preparation.";
  const queued = preparation.status === "pending" || preparation.status === "queued";
  if (preparation.mobile) return queued ? "Mobile measurement is ready. Remaining checks are queued." : "Mobile measurement is ready. Waiting for desktop results.";
  if (preparation.desktop) return queued ? "Desktop measurement is ready. Remaining checks are queued." : "Desktop measurement is ready. Waiting for mobile results.";
  return queued ? "Your website measurement is queued." : "Preparing website details and performance measurements.";
}

/** Progress messages come only from the current owner-scoped server receipt. */
export async function prepareWebsite(url: string, onStatus?: (status: string) => void): Promise<Preparation & { mobile: NonNullable<Preparation["mobile"]>; desktop: NonNullable<Preparation["desktop"]> }> {
  const signal = AbortSignal.timeout(240_000);
  const started = await readResponse<{ jobId?: string; existing?: boolean; status?: string }>(await fetch("/api/submissions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }), signal,
  }));
  if (started.existing) throw new Error("This website is already listed. Open its existing report.");
  if (!started.jobId || !/^[a-f0-9-]{36}$/i.test(started.jobId)) throw new Error("The preparation request could not be started.");
  if (started.status === "pending" || started.status === "queued") onStatus?.("Your website measurement is queued.");
  for (let attempt = 0; attempt < 100; attempt++) {
    signal.throwIfAborted();
    const preparation = await readResponse<Preparation>(await fetch("/api/submissions/" + started.jobId, { cache: "no-store", signal }));
    if (preparation.duplicate) throw new Error("This website is already listed. Open its existing report.");
    if (preparation.status === "succeeded") {
      if (!preparation.mobile || !preparation.desktop) throw new Error("The measurement expired. Test your website again.");
      onStatus?.(preparationStatus(preparation));
      return { ...preparation, mobile: preparation.mobile, desktop: preparation.desktop };
    }
    if (["failed", "cancelled", "dead"].includes(preparation.status)) throw new Error("The website could not be measured. Please try again.");
    onStatus?.(preparationStatus(preparation));
    await new Promise((resolve) => setTimeout(resolve, 2400));
  }
  throw new Error("Your measurement is still being processed. Please try again shortly.");
}

export async function publishWebsite(input: PublicationFields): Promise<Response> {
  const details = listingDetailsSchema.safeParse(input);
  if (!details.success) throw new Error(details.error.issues[0]?.message ?? "Complete the required website details.");
  // A preparation can be reused by the server, but a score from browser storage
  // or an old checkout query parameter is never evidence for publication.
  const prepared = await prepareWebsite(details.data.url);
  return fetch("/api/submit", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...details.data, isListed: input.isListed,
      preparationId: prepared.id, testResultId: prepared.mobile.id, desktopTestResultId: prepared.desktop.id,
    }),
    signal: AbortSignal.timeout(90_000),
  });
}

export async function readWebsiteMetadata(url: string, signal?: AbortSignal): Promise<Partial<SiteMetadata>> {
  return readResponse<Partial<SiteMetadata>>(await fetch(`/api/submit?action=metadata&url=${encodeURIComponent(url)}`, {
    cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  }));
}
