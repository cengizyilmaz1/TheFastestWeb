import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OutboundLink, observeOutboundClick } from "./OutboundLink";
afterEach(() => vi.unstubAllGlobals());

describe("ordinary outbound links", () => {
  it("renders the real followed destination and attribution before JavaScript executes", () => {
    const html = renderToStaticMarkup(createElement(OutboundLink, { href: "https://www.indietools.app/#tools", placement: "sidebar", trackingId: 9 }, "IndieTools"));
    expect(html).toContain('href="https://www.indietools.app/?utm_source=thefastestweb.site&amp;utm_medium=referral&amp;utm_campaign=sidebar_ad#tools"');
    expect(html).toContain('target="_blank"'); expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("/api/");
  });
  it("sends a JSON beacon and never waits for its result", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true), fetch = vi.fn();
    vi.stubGlobal("navigator", { sendBeacon }); vi.stubGlobal("fetch", fetch);
    expect(observeOutboundClick("sidebar", 42)).toBeUndefined();
    const [endpoint, body] = sendBeacon.mock.calls[0];
    expect(endpoint).toBe("/api/ad-click"); expect(body.type).toBe("application/json");
    expect(JSON.parse(await body.text())).toEqual({ id: 42 }); expect(fetch).not.toHaveBeenCalled();
  });
  it("falls back to a bounded keepalive request without cookies and swallows failures", async () => {
    vi.stubGlobal("navigator", { sendBeacon: vi.fn().mockReturnValue(false) });
    const fetch = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", fetch);
    expect(() => observeOutboundClick("product", "synthetic")).not.toThrow();
    expect(fetch).toHaveBeenCalledWith("/api/site-click", expect.objectContaining({ keepalive: true, credentials: "omit", redirect: "error" }));
    await Promise.resolve();
  });
});
