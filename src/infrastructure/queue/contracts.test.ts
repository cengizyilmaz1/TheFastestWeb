import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { validateQueueJob, validateQueuePayload } from "./contracts";

describe("background delivery contract", () => {
  it.each(["site.performance.daily", "site.performance.manual"])("accepts implemented job %s", (kind) => {
    expect(validateQueueJob({ id: randomUUID(), queue: "performance", kind }).kind).toBe(kind);
  });
  it.each([
    { queue: "screenshots", kind: "screenshot.capture" },
    { queue: "performance", kind: "maintenance.cleanup" },
    { queue: "maintenance", kind: "site.performance.daily" },
    { queue: "performance", kind: "site.retest" },
  ])("rejects unimplemented or mismatched job %j", (job) => {
    expect(() => validateQueueJob({ id: randomUUID(), ...job })).toThrow();
  });
  it("rejects URLs or secrets in delivery payloads", () => {
    expect(() => validateQueuePayload("performance", "site.performance.daily", { jobId: randomUUID(), correlationId: randomUUID(), url: "https://example.com/private" })).toThrow();
  });
  it("rejects non-UUID delivery IDs", () => {
    expect(() => validateQueueJob({ id: "site:1:today", queue: "performance", kind: "site.performance.daily" })).toThrow();
  });
});
