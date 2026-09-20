import { describe, expect, it } from "vitest";
import { isManagedRedirectPath, redirectInputSchema, redirectsConflict } from "./policy";
import { getFounderPath, usernameFromName } from "@/modules/founders/paths";
describe("redirect and founder path boundaries", () => {
  it("accepts only exact public same-origin paths", () => {
    for (const value of ["/", "/about", "/blog/fast-sites", "/fastest/developer-tools"]) expect(isManagedRedirectPath(value)).toBe(true);
    for (const value of ["https://evil.test/", "//evil.test", "/%2fevil", "/a/../admin", "/ADMIN", "/auth/callback", "/api/payments", "/founder/private-name", "/profile/uuid", "/health/ready", "/a?token=secret", "/a#hash", "/a\\b", "/a//b", "/a/"]) expect(isManagedRedirectPath(value)).toBe(false);
  });
  it("rejects loops, redirect chains, duplicate sources and homepage overrides", () => {
    const rule = { id: "one", sourcePath: "/old", destinationPath: "/new", enabled: true };
    for (const target of [{ sourcePath: "/new", destinationPath: "/final" }, { sourcePath: "/before", destinationPath: "/old" }, { sourcePath: "/old", destinationPath: "/elsewhere" }])
      expect(redirectsConflict({ id: "two", enabled: true, ...target }, [rule])).toBe(true);
    expect(redirectsConflict({ id: "one", enabled: true, sourcePath: "/old", destinationPath: "/updated" }, [rule])).toBe(false);
    const input = { id: "00000000-0000-4000-8000-000000000001", sourcePath: "/", destinationPath: "/about", statusCode: 301, enabled: true, expectedVersion: 0, reason: "Synthetic test" };
    expect(redirectInputSchema.safeParse(input).success).toBe(false);
    expect(redirectInputSchema.safeParse({ ...input, sourcePath: "/about" }).success).toBe(false);
  });
  it("produces readable normalized names without accepting an email as a path", () => {
    expect(usernameFromName("Cengiz YILMAZ")).toBe("cengiz-yilmaz");
    expect(usernameFromName("Çağrı İŞIK")).toBe("cagri-isik");
    expect(usernameFromName("🌍")).toBe("member");
    expect(getFounderPath("cengiz-yilmaz")).toBe("/founder/cengiz-yilmaz");
  });
});

