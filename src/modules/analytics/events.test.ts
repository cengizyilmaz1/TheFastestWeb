import { describe, expect, it } from "vitest";
import { analyticsEventSchema } from "./events";
describe("server domain analytics schema", () => {
  it("accepts only named and bounded business properties", () => {
    expect(analyticsEventSchema.safeParse({ name: "speed_test_completed", eventKey: "test:synthetic:completed",
      properties: { strategy: "mobile", score: 92, methodologyVersion: "psi-v2-two-sample" } }).success).toBe(true);
  });
  it.each([{ email: "synthetic@example.com" }, { ip: "127.0.0.1" }, { url: "https://example.com/private" }, { arbitrary: true }])("rejects extra data %j", (properties) => {
    expect(analyticsEventSchema.safeParse({ name: "badge_verified", eventKey: "badge:synthetic", properties }).success).toBe(false);
  });
  it("rejects arbitrary browser events and identifying event keys", () => {
    expect(analyticsEventSchema.safeParse({ name: "pageview", eventKey: "view:1", properties: {} }).success).toBe(false);
    expect(analyticsEventSchema.safeParse({ name: "badge_verified", eventKey: "synthetic@example.com", properties: {} }).success).toBe(false);
  });
});
