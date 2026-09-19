import { describe, expect, it, vi } from "vitest";
import { createSafeFetchText, type PinnedResponse, type PinnedTransport, pinnedRequestOptions } from "./safe-fetch";
import { UnsafeUrlError } from "./public-url";

const publicResolver = async () => [{ address: "1.1.1.1", family: 4 as const }];
function response(body: string, status = 200, headers: Record<string, string> = {}): PinnedResponse {
  return {
    status, headers: new Headers({ "content-type": "text/html", ...headers }),
    body: (async function* () { yield Buffer.from(body); })(), close: vi.fn(),
  };
}

describe("DNS pinned bounded HTML fetch", () => {
  it("pins the checked DNS record and preserves the original TLS/Host hostname", async () => {
    const resolver = vi.fn().mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }])
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const transport = vi.fn<PinnedTransport>().mockResolvedValue(response("<title>Safe</title>"));
    const fetch = createSafeFetchText({ resolver, transport });
    await expect(fetch("https://example.com")).resolves.toMatchObject({ html: "<title>Safe</title>" });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0].address.address).toBe("1.1.1.1");
    const config = pinnedRequestOptions(new URL("https://example.com/path"), { address: "1.1.1.1", family: 4 });
    expect(config.hostname).toBe("example.com");
    expect(config.agent).toBe(false);
    const pinnedLookup = config.lookup!;
    const callback = vi.fn();
    pinnedLookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "1.1.1.1", 4);
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to cloud metadata before sending a second request", async () => {
    const redirect = response("", 302, { location: "http://169.254.169.254/latest/meta-data" });
    const transport = vi.fn<PinnedTransport>().mockResolvedValue(redirect);
    const fetch = createSafeFetchText({ resolver: publicResolver, transport });
    await expect(fetch("https://example.com")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(redirect.close).toHaveBeenCalled();
  });

  it("revalidates DNS for each redirect and rejects rebinding on the same host", async () => {
    const resolver = vi.fn().mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    const transport = vi.fn<PinnedTransport>().mockResolvedValue(response("", 302, { location: "/next" }));
    await expect(createSafeFetchText({ resolver, transport })("https://example.com"))
      .rejects.toBeInstanceOf(UnsafeUrlError);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("returns the verified final redirect URL and preserves resource query parameters", async () => {
    const transport = vi.fn<PinnedTransport>()
      .mockResolvedValueOnce(response("", 301, { location: "https://www.example.com/next?utm_source=required" }))
      .mockResolvedValueOnce(response("final"));
    await expect(createSafeFetchText({ resolver: publicResolver, transport })("http://example.com"))
      .resolves.toMatchObject({ url: "https://www.example.com/next?utm_source=required", html: "final" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("closes streams exceeding the byte budget, including chunked responses", async () => {
    const oversized = response("too long");
    const fetch = createSafeFetchText({ resolver: publicResolver, transport: async () => oversized });
    await expect(fetch("https://example.com", { maxBytes: 4 })).rejects.toThrow("too large");
    expect(oversized.close).toHaveBeenCalledTimes(1);
  });

  it("rejects declared oversized responses and compressed bombs before reading", async () => {
    const fixtures: Record<string, string>[] = [{ "content-length": "10000" }, { "content-encoding": "gzip" }];
    for (const headers of fixtures) {
      const fetch = createSafeFetchText({ resolver: publicResolver, transport: async () => response("", 200, headers) });
      await expect(fetch("https://example.com", { maxBytes: 4 })).rejects.toThrow();
    }
  });

  it("bounds redirects and rejects loops", async () => {
    const fetch = createSafeFetchText({ resolver: publicResolver, transport: async () => response("", 302, { location: "/" }) });
    await expect(fetch("https://example.com")).rejects.toThrow("loop");
  });

  it("enforces the overall deadline even if DNS never completes", async () => {
    const transport = vi.fn<PinnedTransport>();
    const fetch = createSafeFetchText({ resolver: () => new Promise(() => undefined), transport });
    await expect(fetch("https://example.com", { timeoutMs: 10 })).rejects.toThrow("timed out");
    expect(transport).not.toHaveBeenCalled();
  });
});
