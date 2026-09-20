import type { DataFastWeb } from "datafast";
import { isAnalyticsPage } from "./consent";

let clientPromise: Promise<DataFastWeb> | undefined;

/** The SDK reads document.referrer itself. Never initialize on a sensitive referrer. */
export function isAnalyticsReferrer(referrer: string): boolean {
  if (!referrer) return true;
  try {
    const url = new URL(referrer);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.hash
      && isAnalyticsPage(url.pathname, url.search)
      && !/@|%40/i.test(url.pathname);
  } catch { return false; }
}

/** A single client per consented document; no automatic URL, identity or payment capture. */
export function loadDataFastClient(websiteId: string, domain: string): Promise<DataFastWeb> {
  return clientPromise ??= import("datafast").then(({ initDataFast }) => initDataFast({
    websiteId, domain, autoCapturePageviews: false, allowLocalhost: false, allowIframe: false,
    debug: false,
  })).catch((error: unknown) => { clientPromise = undefined; throw error; });
}

/** SDK queues are persisted separately from cookies. Revocation must remove both. */
export function clearDataFastStorage(storage: Pick<Storage, "length" | "key" | "removeItem">): void {
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) if (key?.startsWith("datafast_")) storage.removeItem(key);
}
