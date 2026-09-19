import { request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createBrowserEgressProxy, parseConnectAuthority } from "./egress-proxy";
import { secureChromiumArgs } from "./render-html";

describe("browser egress proxy policy", () => {
  it.each([
    "127.0.0.1:443", "[::1]:443", "10.0.0.1:443", "example.com:22",
    "example.com:8443", "user@example.com:443", "example.com:443/path",
    "example.com:443#x", "example.com:443?x", "metadata.google.internal:443",
  ])("rejects unsafe CONNECT authority %s", (authority) => {
    expect(() => parseConnectAuthority(authority)).toThrow();
  });

  it("allows a public TLS authority and public IPv6 authority", () => {
    expect(parseConnectAuthority("example.com:443").hostname).toBe("example.com");
    expect(parseConnectAuthority("[2606:4700:4700::1111]:443").hostname).toBe("[2606:4700:4700::1111]");
  });

  it("retains the browser sandbox and disables direct connection bypasses", () => {
    const args = secureChromiumArgs("http://127.0.0.1:12345");
    expect(args).toContain("--proxy-bypass-list=<-loopback>");
    expect(args).toContain("--disable-quic");
    expect(args).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    expect(args.some((arg) => arg.startsWith("--host-resolver-rules=MAP * ~NOTFOUND"))).toBe(true);
    expect(args).not.toContain("--no-sandbox");
    expect(args).not.toContain("--disable-setuid-sandbox");
  });

  it("rejects a rebinding/private DNS target through a real loopback proxy request", async () => {
    const resolver = vi.fn().mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const proxy = await createBrowserEgressProxy({ resolver });
    try {
      const address = new URL(proxy.url);
      const status = await new Promise<number>((resolve, reject) => {
        const outbound = request({ hostname: address.hostname, port: address.port, path: "http://example.com/" }, (response) => {
          response.resume();
          response.once("end", () => resolve(response.statusCode ?? 0));
        });
        outbound.once("error", reject);
        outbound.end();
      });
      expect(status).toBe(403);
      expect(resolver).toHaveBeenCalledWith("example.com");
    } finally {
      await proxy.close();
    }
  });

  it("rejects private CONNECT targets without opening an upstream socket", async () => {
    const proxy = await createBrowserEgressProxy();
    try {
      const address = new URL(proxy.url);
      const status = await new Promise<number>((resolve, reject) => {
        const outbound = request({ hostname: address.hostname, port: address.port, method: "CONNECT", path: "169.254.169.254:443" });
        outbound.once("connect", (response, socket) => { socket.destroy(); resolve(response.statusCode ?? 0); });
        outbound.once("error", reject);
        outbound.end();
      });
      expect(status).toBe(403);
    } finally {
      await proxy.close();
    }
  });
});
