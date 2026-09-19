import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PSIResult } from "@/lib/pagespeed";
import { cleanupIntegrationDatabase, fixtureSql, prepareIntegrationDatabase, resetIntegrationData } from "./database";

const { psi, secret } = vi.hoisted(() => ({ psi: vi.fn(), secret: "synthetic-cron-secret-for-local-integration-tests" }));
vi.mock("@/lib/pagespeed", () => ({ runPageSpeedTest: psi, METHODOLOGY_VERSION: "psi-v1-single" }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ CRON_SECRET: secret }) }));
import { GET } from "@/app/api/cron/retest/route";

const measurement: PSIResult = {
  lighthouseVersion: "13.0.0", score: 94, loadTimeMs: 1210, fcpMs: 740, lcpMs: 1210, cls: 0.02,
  tbtMs: 10, ttiMs: null, siMs: 1020, fcpScore: 0.99, lcpScore: 0.98, clsScore: 0.99,
  tbtScore: 0.99, ttiScore: null, siScore: 0.99,
  fcp: "0.7 s", lcp: "1.2 s", clsDisplay: "0.02", tbt: "10 ms", tti: "Unavailable", si: "1.0 s", loadTime: "1.2 s",
  rawResponse: {},
};

function request() {
  return new NextRequest("https://example.com/api/cron/retest", { headers: { authorization: `Bearer ${secret}` } });
}

async function twoOverdueSites() {
  const owner = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  await fixtureSql()`INSERT INTO public.users (id,email,name) VALUES (${owner},'cron-fixture@example.invalid','Synthetic cron owner')`;
  await fixtureSql()`INSERT INTO public.sites (id,slug,name,url,normalized_url,description,owner_id,owner_name,is_listed,current_score,current_load_time,last_tested_at)
    VALUES (${first},'oldest-failure','Oldest fixture','https://example.com/','https://example.com/','Synthetic fixture',${owner},'Synthetic owner',true,88,'1.4 s',now()-interval '3 days'),
           (${second},'next-eligible','Next fixture','https://example.org/','https://example.org/','Synthetic fixture',${owner},'Synthetic owner',true,91,'1.3 s',now()-interval '2 days')`;
  await fixtureSql()`INSERT INTO public.speed_tests (site_id,score,lcp_ms) VALUES (${first},88,1400),(${second},91,1300)`;
  return { first, second };
}

beforeAll(prepareIntegrationDatabase, 60_000);
afterAll(cleanupIntegrationDatabase, 30_000);
beforeEach(async () => {
  await resetIntegrationData();
  psi.mockReset().mockResolvedValue(measurement);
});

describe("bounded retest scheduling with real PostgreSQL transactions", () => {
  it("preserves failed-site metrics/history and selects the next site during cooldown", async () => {
    const { first, second } = await twoOverdueSites();
    const [before] = await fixtureSql()`SELECT to_jsonb(s) AS snapshot FROM public.sites s WHERE id=${first}`;
    psi.mockRejectedValueOnce(new Error("Synthetic provider timeout"));
    const failedResponse = await GET(request(), undefined);
    expect(failedResponse.status).toBe(200);
    expect(await failedResponse.json()).toEqual({ skipped: false, testedCount: 0, failedCount: 1 });
    const [afterFailure] = await fixtureSql()`SELECT to_jsonb(s) AS snapshot FROM public.sites s WHERE id=${first}`;
    expect(afterFailure.snapshot).toEqual(before.snapshot);
    const [firstHistory] = await fixtureSql()`SELECT count(*)::integer AS tests FROM public.speed_tests WHERE site_id=${first}`;
    expect(firstHistory.tests).toBe(1);
    const [failure] = await fixtureSql()`SELECT tested_count,failed_count,results,error FROM public.cron_logs`;
    expect({ ...failure }).toEqual({ tested_count: 0, failed_count: 1, results: { siteId: first, status: "failed" }, error: "UPSTREAM_UNAVAILABLE" });

    const nextResponse = await GET(request(), undefined);
    expect(nextResponse.status).toBe(200);
    expect(await nextResponse.json()).toEqual({ skipped: false, testedCount: 1 });
    expect(psi).toHaveBeenNthCalledWith(1, "https://example.com/", "mobile");
    expect(psi).toHaveBeenNthCalledWith(2, "https://example.org/", "mobile");
    const [unchanged] = await fixtureSql()`SELECT to_jsonb(s) AS snapshot FROM public.sites s WHERE id=${first}`;
    expect(unchanged.snapshot).toEqual(before.snapshot);
    const [successful] = await fixtureSql()`SELECT current_score,last_tested_at FROM public.sites WHERE id=${second}`;
    expect(successful.current_score).toBe(measurement.score);
    expect(successful.last_tested_at.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const [history] = await fixtureSql()`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE methodology_version='psi-v1-single')::integer AS fresh FROM public.speed_tests`;
    expect({ ...history }).toEqual({ total: 3, fresh: 1 });
  });

  it("skips a concurrent trigger while the first transaction holds the retest lock", async () => {
    await twoOverdueSites();
    let markEntered!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { markEntered = resolve; });
    const result = new Promise<PSIResult>((resolve) => { release = () => resolve(measurement); });
    psi.mockImplementation(() => { markEntered(); return result; });
    const active = GET(request(), undefined);
    await entered;
    try {
      const overlapping = await GET(request(), undefined);
      expect(overlapping.status).toBe(200);
      expect(await overlapping.json()).toEqual({ skipped: true, testedCount: 0 });
      expect(psi).toHaveBeenCalledOnce();
    } finally {
      release();
    }
    const complete = await active;
    expect(complete.status).toBe(200);
    expect(await complete.json()).toEqual({ skipped: false, testedCount: 1 });
    const [history] = await fixtureSql()`SELECT count(*)::integer AS tests FROM public.speed_tests`;
    expect(history.tests).toBe(3);
  });
});
