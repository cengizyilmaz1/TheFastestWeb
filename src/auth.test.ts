import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ synchronize: vi.fn() }));
vi.mock("@/modules/auth/google-user", () => ({ synchronizeGoogleUser: mocks.synchronize }));
vi.mock("@/config/env", () => ({ getEnv: () => ({
  AUTH_SECRET: "unit-test-only-secret-at-least-32-characters",
  AUTH_GOOGLE_ID: "unit-client", AUTH_GOOGLE_SECRET: "unit-client-secret",
}) }));
import { createAuthOptions } from "./auth";
beforeEach(() => { mocks.synchronize.mockReset(); });
describe("Google callback authorization", () => {
  it("rejects unverified email and unexpected providers before database writes", async () => {
    const signIn = createAuthOptions().callbacks!.signIn!;
    for (const [provider, verified] of [["google", false], ["github", true]] as const) {
      expect(await signIn({
        user: { id: "google-subject", email: "test@example.com", name: "Test" },
        account: { provider, providerAccountId: "subject", type: "oauth" },
        profile: { email_verified: verified } as Parameters<typeof signIn>[0]["profile"],
      })).toBe(false);
    }
    expect(mocks.synchronize).not.toHaveBeenCalled();
  });
  it("sets the persisted UUID rather than the external subject", async () => {
    const id = "1101af3f-43a9-49a9-bd9c-e4c75b704fe0";
    mocks.synchronize.mockResolvedValue(id);
    const signIn = createAuthOptions().callbacks!.signIn!;
    const user = { id: "google-subject", email: "test@example.com", name: "Test" };
    expect(await signIn({
      user, account: { provider: "google", providerAccountId: "subject", type: "oauth" },
      profile: { email_verified: true } as Parameters<typeof signIn>[0]["profile"],
    })).toBe(true);
    expect(user.id).toBe(id);
  });
  it("denies sign-in on persistence failure", async () => {
    mocks.synchronize.mockRejectedValue(new Error("private database detail"));
    const signIn = createAuthOptions().callbacks!.signIn!;
    expect(await signIn({
      user: { id: "google-subject", email: "test@example.com", name: "Test" },
      account: { provider: "google", providerAccountId: "subject", type: "oauth" },
      profile: { email_verified: true } as Parameters<typeof signIn>[0]["profile"],
    })).toBe(false);
  });
});
