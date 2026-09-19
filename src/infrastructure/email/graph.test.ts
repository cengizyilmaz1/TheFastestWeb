import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ EMAIL_ENABLED: true, M365_TENANT_ID: "synthetic-tenant", M365_CLIENT_ID: "synthetic-client",
  M365_CLIENT_SECRET: "synthetic-secret", M365_SENDER: "sender@example.com" }));
vi.mock("@/config/env", () => ({ getEnv: () => config }));
const fetchMock = vi.fn();
const message = { to: "recipient@example.com", subject: "Test", html: "<p>Synthetic</p>" };
beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); config.EMAIL_ENABLED = true; });
afterEach(() => { vi.unstubAllGlobals(); });
const token = () => new Response(JSON.stringify({ access_token: "synthetic-token", expires_in: 3600 }), { status: 200 });
describe("Graph app-only delivery", () => {
  it("caches token and reports accepted, never delivered", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValue(new Response(null, { status: 202 }));
    const { graphMail } = await import("./graph");
    expect(await graphMail.send(message)).toEqual({ status: "accepted" });
    expect(await graphMail.send(message)).toEqual({ status: "accepted" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].body.get("grant_type")).toBe("client_credentials");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).saveToSentItems).toBe(true);
  });
  it.each([429, 401])("allows retry for explicit rejection %s", async (status) => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(null, { status }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({ retryable: true });
  });
  it("does not retry ambiguous transport failure after send begins", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockRejectedValueOnce(new Error("private-provider-details"));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({ retryable: false, deliveryCode: "UNCERTAIN" });
  });
  it("does not retry server errors whose delivery outcome is unknown", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response("private-details", { status: 503 }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({ retryable: false, deliveryCode: "UNCERTAIN" });
  });
  it("does not contact any provider when disabled or recipient is invalid", async () => {
    config.EMAIL_ENABLED = false;
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    config.EMAIL_ENABLED = true;
    await expect((await import("./graph")).graphMail.send({ ...message, to: "invalid" })).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
