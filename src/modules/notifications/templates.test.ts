import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationTemplates, renderNotification } from "./templates";
import { createUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";
vi.mock("@/config/env", () => ({ getEnv: () => ({ SITE_URL: "https://thefastestweb.site", EMAIL_UNSUBSCRIBE_SECRET: "synthetic-unsubscribe-secret-at-least-32" }) }));
afterEach(() => vi.useRealTimers());
describe("notification content and preferences", () => {
  it("renders all required event categories", () => {
    expect(Object.keys(notificationTemplates)).toHaveLength(15);
    for (const template of Object.keys(notificationTemplates) as (keyof typeof notificationTemplates)[]) {
      expect(renderNotification(template, {}).html).toContain("https://thefastestweb.site/dashboard");
    }
  });
  it("escapes untrusted names and disallows offsite action URLs", () => {
    expect(renderNotification("welcome", { name: "<script>alert(1)</script>" }).html).not.toContain("<script>");
    expect(() => renderNotification("welcome", { actionPath: "//evil.example" })).toThrow();
    expect(() => renderNotification("welcome", { actionPath: "/\\evil.example" })).toThrow();
  });
  it("scopes unsubscribe capability to exactly one user/category", () => {
    const userId = "00000000-0000-4000-8000-000000000001";
    const token = createUnsubscribeToken(userId, "weekly");
    expect(verifyUnsubscribeToken(token)).toMatchObject({ userId, category: "weekly" });
    expect(() => verifyUnsubscribeToken(`${token.slice(0, -5)}aaaaa`)).toThrow("invalid");
  });
  it("expires unsubscribe links and rejects malformed input", () => {
    const token = createUnsubscribeToken("00000000-0000-4000-8000-000000000001", "badge");
    vi.useFakeTimers(); vi.setSystemTime(Date.now() + 181 * 86_400_000);
    expect(() => verifyUnsubscribeToken(token)).toThrow("expired");
    expect(() => verifyUnsubscribeToken("x".repeat(1025))).toThrow("invalid");
  });
});
