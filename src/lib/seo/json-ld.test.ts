import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./json-ld";
describe("safeJsonLd", () => {
  it("prevents stored script breakouts without changing data", () => {
    const value = { name: '</script><script>alert("x")</script>', nested: ["<!--", "&", "\u2028", "\u2029"] };
    const output = safeJsonLd(value);
    expect(output).not.toMatch(/[<>&\u2028\u2029]/);
    expect(JSON.parse(output)).toEqual(value);
  });
  it("rejects non-JSON values", () => { expect(() => safeJsonLd(undefined)).toThrow(); });
});
