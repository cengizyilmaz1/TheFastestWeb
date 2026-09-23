import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";
import { GET } from "../../src/app/api/sites/route";

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(resetIntegrationData);
const request = (sort: "score" | "loadtime", offset = 0, limit = 20) => GET(new NextRequest(`https://example.invalid/api/sites?sort=${sort}&offset=${offset}&limit=${limit}`), undefined);

describe("global leaderboard sorting and pagination", () => {
  it("finds the globally fastest website outside the first score page and keeps later pages distinct", async () => {
    const sql = fixtureSql();
    await sql`INSERT INTO sites ${sql(Array.from({ length: 61 }, (_, index) => ({ id: randomUUID(), slug: `site-${index}`,
      name: `Site ${index}`, url: `https://public.invalid/${index}`, normalized_url: `https://public.invalid/${index}`,
      description: "Published website", owner_name: "Fixture", is_listed: true, lifecycle: "active", current_score: 100 - index,
      current_load_time: index === 60 ? " 50 ms " : `${index + 1} s`, created_at: new Date(1_700_000_000_000 + index * 1000) })))}`;
    const initial = await (await request("score", 0, 50)).json();
    expect(initial.sites).toHaveLength(50);
    expect(initial.sites.some((row: { slug: string }) => row.slug === "site-60")).toBe(false);
    const all: string[] = [];
    for (const offset of [0, 20, 40, 60]) {
      const response = await request("loadtime", offset);
      expect(response.status).toBe(200);
      const page = await response.json();
      expect(page.total).toBe(61);
      expect(page.hasMore).toBe(offset < 60);
      all.push(...page.sites.map((row: { slug: string }) => row.slug));
    }
    expect(all).toEqual(["site-60", ...Array.from({ length: 60 }, (_, index) => `site-${index}`)]);
    expect(new Set(all).size).toBe(61);
  });

  it("orders spaced seconds and milliseconds numerically, with invalid values last and stable ties", async () => {
    const sql = fixtureSql();
    const rows = [
      { slug: "slow", current_score: 99, current_load_time: " 2 s " },
      { slug: "fast", current_score: 60, current_load_time: "950 ms" },
      { slug: "tiny", current_score: 50, current_load_time: " 25 MS " },
      { slug: "tie-ms", current_score: 90, current_load_time: "1200ms" },
      { slug: "tie-seconds", current_score: 90, current_load_time: "1.2 s" },
      { slug: "invalid", current_score: 100, current_load_time: "1 2 s" },
      { slug: "missing", current_score: 100, current_load_time: null },
    ];
    await sql`INSERT INTO sites ${sql(rows.map((row, index) => ({ ...row, id: randomUUID(), name: row.slug,
      url: `https://public.invalid/${row.slug}`, normalized_url: `https://public.invalid/${row.slug}`,
      description: "Published website", owner_name: "Fixture", is_listed: true, lifecycle: "active", created_at: new Date(1_700_000_000_000 + index * 1000) })))}`;
    const load = await (await request("loadtime")).json();
    expect(load.sites.map((row: { slug: string }) => row.slug)).toEqual(["tiny", "fast", "tie-ms", "tie-seconds", "slow", "invalid", "missing"]);
    const score = await (await request("score")).json();
    expect(score.sites.map((row: { slug: string }) => row.slug)).toEqual(["invalid", "missing", "slow", "tie-ms", "tie-seconds", "fast", "tiny"]);
  });
});
