import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ getDb: () => null }));
vi.mock("@/infrastructure/queue/redis", () => ({ readRedisHealth: vi.fn() }));

import { getOverview, listUsers, maskEmail, pageNumber, searchPattern } from "./dashboard";

describe("administrator read models", () => {
  it("masks account emails while keeping them recognisable", () => {
    expect(maskEmail("cengiz@example.com")).toBe("ce••••@example.com");
    expect(maskEmail("a@example.com")).toBe("••••@example.com");
    expect(maskEmail("ab@example.com")).toBe("a••••@example.com");
    expect(maskEmail("not-an-email")).toBe("hidden");
    expect(maskEmail("cengiz@example.com")).not.toContain("cengiz");
  });

  it("treats search text as literal characters, never as a pattern", () => {
    expect(searchPattern("  acme  ")).toBe("%acme%");
    expect(searchPattern("100%_\\")).toBe(String.raw`%100\%\_\\%`);
    expect(searchPattern("\u0000\n ")).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
    expect(searchPattern("x".repeat(500))).toHaveLength(82);
  });

  it("accepts only bounded positive page numbers", () => {
    for (const value of [undefined, "", "0", "-1", "1.5", "abc", "10001", "1e3x"]) expect(pageNumber(value)).toBe(1);
    expect(pageNumber("7")).toBe(7);
  });

  it("fails closed when the database is unavailable", async () => {
    const actor = { userId: "administrator", role: "admin" as const };
    await expect(getOverview(actor)).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
    await expect(listUsers(actor, {})).rejects.toMatchObject({ code: "DATABASE_UNAVAILABLE", status: 503 });
  });
});
