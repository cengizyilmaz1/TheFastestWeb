import { describe, expect, it, vi } from "vitest";
import { isPublicAddress, normalizePublicUrl, resolvePublicTarget, UnsafeUrlError } from "./public-url";

describe("public website URL policy", () => {
  it.each([
    "http://localhost", "http://localhost.", "http://internal", "https://db.internal",
    "https://service.local", "https://metadata.google.internal", "http://127.0.0.1",
    "http://127.1", "http://2130706433", "http://0x7f000001", "http://0177.0.0.1",
    "http://10.1.2.3", "http://172.16.1.1", "http://192.168.1.1", "http://169.254.169.254",
    "http://100.100.100.200", "http://168.63.129.16", "http://0.0.0.0", "http://224.0.0.1",
    "http://198.18.0.1", "http://192.0.2.1", "http://[::1]", "http://[::]",
    "http://[::ffff:127.0.0.1]", "http://[::ffff:8.8.8.8]", "http://[64:ff9b::a00:1]",
    "http://[fc00::1]", "http://[fe80::1]", "http://[2001:db8::1]", "http://[3fff::1]",
    "file:///etc/passwd", "ftp://example.com", "gopher://example.com", "data:text/html,hello",
    "javascript:alert(1)", "https://name:password@example.com", "http://example.com:8080",
    "https://example.com:80", "https://example.com\\@127.0.0.1", "https://exam\nple.com",
  ])("blocks unsafe URL %s", (url) => {
    expect(() => normalizePublicUrl(url)).toThrow(UnsafeUrlError);
  });

  it("normalizes casing, default port, punycode, fragment and known tracking parameters", () => {
    expect(normalizePublicUrl("HTTPS://BÜCHER.DE:443/catalog?utm_source=a&edition=2&fbclid=abc#top"))
      .toBe("https://xn--bcher-kva.de/catalog?edition=2");
    expect(normalizePublicUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves protocol, www, path case, trailing slash and semantic query order", () => {
    expect(normalizePublicUrl("http://www.example.com/Store/?page=2&sort=price"))
      .toBe("http://www.example.com/Store/?page=2&sort=price");
    expect(normalizePublicUrl("https://example.com/Store")).not.toBe(normalizePublicUrl("https://example.com/Store/"));
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])("allows public address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("rejects mixed DNS answers even when the first answer is public", async () => {
    await expect(resolvePublicTarget("https://example.com", async () => [
      { address: "1.1.1.1", family: 4 }, { address: "10.0.0.1", family: 4 },
    ])).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a private IPv6 DNS answer and empty DNS responses", async () => {
    await expect(resolvePublicTarget("https://example.com", async () => [{ address: "::1", family: 6 }]))
      .rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(resolvePublicTarget("https://example.com", async () => [])).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("does not resolve validated public literal addresses", async () => {
    const resolver = vi.fn();
    await expect(resolvePublicTarget("https://[2606:4700:4700::1111]", resolver)).resolves.toMatchObject({
      address: { address: "2606:4700:4700::1111", family: 6 },
    });
    expect(resolver).not.toHaveBeenCalled();
  });
});
