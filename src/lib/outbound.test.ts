import { describe, expect, it } from "vitest";
import { outboundHref } from "./outbound";

describe("public outbound referral URLs", () => {
  it("sets this referring site's attribution while preserving affiliate queries and the fragment", () => {
    const value = outboundHref("https://example.com/product?affiliate=123&utm_source=old&utm_source=duplicate&utm_medium=email&utm_campaign=old&ref=partner#features", "product")!;
    const url = new URL(value);
    expect(url.pathname).toBe("/product"); expect(url.hash).toBe("#features");
    expect(url.searchParams.get("affiliate")).toBe("123"); expect(url.searchParams.get("ref")).toBe("partner");
    expect(url.searchParams.getAll("utm_source")).toEqual(["thefastestweb.site"]);
    expect(url.searchParams.get("utm_medium")).toBe("referral"); expect(url.searchParams.get("utm_campaign")).toBe("product_listing");
  });
  it("is idempotent and distinguishes sidebar visits", () => {
    const result = outboundHref("http://example.com/#demo", "sidebar")!;
    expect(outboundHref(result, "sidebar")).toBe(result);
    expect(new URL(result).searchParams.get("utm_campaign")).toBe("sidebar_ad");
    expect(new URL(result).hash).toBe("#demo");
  });
  it.each(["javascript:alert(1)", "data:text/html,test", "https://user:password@example.com", "/relative", "not a url"])("does not turn an unsafe value into a link: %s", value => {
    expect(outboundHref(value, "product")).toBeUndefined();
  });
});
