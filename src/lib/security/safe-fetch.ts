import { request as httpRequest, type RequestOptions } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import {
  type AddressResolver, type PublicAddress, parsePublicHttpUrl,
  resolvePublicTarget, systemAddressResolver,
} from "./public-url";

export { normalizePublicUrl, UnsafeUrlError, resolvePublicTarget } from "./public-url";

export class SafeFetchError extends Error {
  readonly code = "TFW-SEC-002";
  constructor(message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

export type SafeFetchOptions = { timeoutMs?: number; maxBytes?: number; maxRedirects?: number };
export type PinnedRequest = {
  url: URL; address: PublicAddress; signal: AbortSignal; maxBytes: number;
};
export type PinnedResponse = {
  status: number; headers: Headers; body: AsyncIterable<Uint8Array>; close: () => void;
};
export type PinnedTransport = (request: PinnedRequest) => Promise<PinnedResponse>;

/** The socket can only use this validated address; it never performs another DNS lookup. */
export function pinnedRequestOptions(url: URL, address: PublicAddress): RequestOptions {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, [address]);
    else callback(null, address.address, address.family);
  };
  return {
    protocol: url.protocol,
    hostname: url.hostname.replace(/^\[|\]$/g, ""),
    port: url.protocol === "https:" ? 443 : 80,
    path: `${url.pathname}${url.search}`,
    lookup,
    family: address.family,
    agent: false,
    maxHeaderSize: 16 * 1024,
  };
}

export const nodePinnedTransport: PinnedTransport = ({ url, address, signal }) => new Promise((resolve, reject) => {
  const request = (url.protocol === "https:" ? httpsRequest : httpRequest)({
    ...pinnedRequestOptions(url, address),
    method: "GET",
    signal,
    headers: {
      "User-Agent": "TheFastestWebBot/2.0",
      Accept: "text/html,application/xhtml+xml;q=0.9",
      "Accept-Encoding": "identity",
    },
  }, (response) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(response.headers)) {
      if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }
    resolve({ status: response.statusCode ?? 0, headers, body: response, close: () => response.destroy() });
  });
  request.once("error", reject);
  request.end();
});

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_BYTES = 2 * 1024 * 1024;

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback : Math.min(Math.max(Math.floor(value), min), max);
}

/** Injectable DNS/transport keep security tests deterministic and off the network. */
export function createSafeFetchText(dependencies: {
  resolver?: AddressResolver; transport?: PinnedTransport;
} = {}) {
  const resolver = dependencies.resolver ?? systemAddressResolver;
  const transport = dependencies.transport ?? nodePinnedTransport;

  return async (input: string, options: SafeFetchOptions = {}): Promise<{ url: string; html: string; headers: Headers }> => {
    const timeoutMs = boundedInteger(options.timeoutMs, 10_000, 1, 30_000);
    const maxBytes = boundedInteger(options.maxBytes, MAX_BYTES, 1, MAX_BYTES);
    const maxRedirects = boundedInteger(options.maxRedirects, 5, 0, 5);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Covers stalled DNS as well as sockets and body reads. DNS completion after
    // the deadline is harmless: signal is checked before the transport runs.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new SafeFetchError("Website request timed out."));
      }, timeoutMs);
    });
    const work = async () => {
      let current = parsePublicHttpUrl(input);
      const visited = new Set<string>();
      for (let hop = 0; hop <= maxRedirects; hop++) {
        if (visited.has(current.href)) throw new SafeFetchError("Website redirect loop detected.");
        visited.add(current.href);
        const target = await resolvePublicTarget(current, resolver);
        controller.signal.throwIfAborted();
        const response = await transport({ ...target, signal: controller.signal, maxBytes });
        try {
          if (REDIRECT_STATUSES.has(response.status)) {
            const location = response.headers.get("location");
            if (!location || hop === maxRedirects) throw new SafeFetchError("Website redirect limit exceeded.");
            current = parsePublicHttpUrl(new URL(location, current).href);
            continue;
          }
          if (response.status < 200 || response.status >= 300) throw new SafeFetchError("Website returned an unsuccessful response.");
          const type = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
          if (type && type !== "text/html" && type !== "application/xhtml+xml") {
            throw new SafeFetchError("Website did not return HTML.");
          }
          const encoding = response.headers.get("content-encoding");
          if (encoding && encoding.toLowerCase() !== "identity") {
            throw new SafeFetchError("Compressed website response is not supported.");
          }
          const length = Number(response.headers.get("content-length") ?? 0);
          if (!Number.isFinite(length) || length > maxBytes) throw new SafeFetchError("Website response is too large.");
          const chunks: Buffer[] = [];
          let bytes = 0;
          for await (const chunk of response.body) {
            controller.signal.throwIfAborted();
            bytes += chunk.byteLength;
            if (bytes > maxBytes) throw new SafeFetchError("Website response is too large.");
            chunks.push(Buffer.from(chunk));
          }
          return { url: current.href, html: Buffer.concat(chunks).toString("utf8"), headers: response.headers };
        } finally {
          response.close();
        }
      }
      throw new SafeFetchError("Website redirect limit exceeded.");
    };
    try {
      return await Promise.race([work(), deadline]);
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}

export const safeFetchText = createSafeFetchText();
