import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const config = vi.hoisted(() => ({ EMAIL_ENABLED: true, M365_TENANT_ID: "synthetic-tenant", M365_CLIENT_ID: "synthetic-client",
  M365_CLIENT_SECRET: "synthetic-secret", M365_SENDER: "sender@example.com" }));
const logs = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/config/env", () => ({ getEnv: () => config }));
vi.mock("@/infrastructure/logging/logger", () => ({ logger: logs }));
const fetchMock = vi.fn();
const message = { to: "recipient@example.com", subject: "Test", html: "<p>Synthetic</p>" };
beforeEach(() => { vi.resetModules(); fetchMock.mockReset(); logs.warn.mockReset(); vi.stubGlobal("fetch", fetchMock); config.EMAIL_ENABLED = true; });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
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
    expect(logs.warn).not.toHaveBeenCalled();
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
  it.each([
    [403, "ErrorAccessDenied"], [403, "ErrorSendAsDenied"], [404, "MailboxNotEnabledForRESTAPI"],
  ])("records only safe diagnostics for Graph %s %s", async (httpStatus, providerCode) => {
    const privateMessage = "private-response-details sender@example.com recipient@example.com synthetic-token";
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(JSON.stringify({
      error: { code: providerCode, message: privateMessage, innerError: { "request-id": privateMessage } },
    }), { status: httpStatus }));
    const failure = await (await import("./graph")).graphMail.send(message).catch(error => error);
    expect(failure).toMatchObject({ deliveryCode: "REJECTED", retryable: false, httpStatus, providerCode });
    expect(logs.warn).toHaveBeenCalledExactlyOnceWith({
      event: "mail.graph_send_failed", httpStatus, providerCode, deliveryCode: "REJECTED", retryable: false,
    });
    for (const privateValue of [privateMessage, message.to, config.M365_SENDER, "synthetic-token", "private-response-details"]) {
      expect(JSON.stringify(logs.warn.mock.calls)).not.toContain(privateValue);
      expect(JSON.stringify(failure)).not.toContain(privateValue);
    }
  });
  it("uses the deepest recognized nested code and canonicalizes known casing", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(JSON.stringify({ error: {
      code: "BadRequest", innerError: { code: "erroraccessdenied", innererror: { code: "ErrorSendAsDenied", message: "private-details" } },
    } }), { status: 403 }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({ providerCode: "ErrorSendAsDenied" });
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain("private-details");
  });
  it.each(["private-recipient@example.com", "ErrorAccessDenied recipient@example.com", "unknown-vendor-code"])("does not echo unrecognized provider code %s", async (code) => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code } }), { status: 403 }));
    const failure = await (await import("./graph")).graphMail.send(message).catch(error => error);
    expect(failure).toMatchObject({ providerCode: "UNRECOGNIZED_ERROR", retryable: false, deliveryCode: "REJECTED" });
    expect(JSON.stringify(failure)).not.toContain(code);
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain(code);
  });
  it.each(["private-html-response", JSON.stringify({ error: { code: "ErrorAccessDenied", message: "x".repeat(16_384) } })])("bounds malformed or oversized diagnostic bodies", async (body) => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(body, { status: 403 }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({
      providerCode: "ERROR_DETAILS_UNAVAILABLE", httpStatus: 403, deliveryCode: "REJECTED", retryable: false,
    });
    expect(JSON.stringify(logs.warn.mock.calls)).not.toContain(body);
  });
  it("bounds a stalled error body and preserves an explicit rejection", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const stalled = new ReadableStream<Uint8Array>({ cancel });
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(stalled, { status: 403 }));
    const { graphMail } = await import("./graph");
    const failure = expect(graphMail.send(message)).rejects.toMatchObject({
      providerCode: "ERROR_DETAILS_UNAVAILABLE", httpStatus: 403, deliveryCode: "REJECTED", retryable: false,
    });
    await vi.advanceTimersByTimeAsync(1001);
    await failure;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("keeps Retry-After and retryability independent of diagnostic codes", async () => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "TooManyRequests" } }), {
      status: 429, headers: { "Retry-After": "120" },
    }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({
      deliveryCode: "RATE_LIMITED", retryable: true, retryAfterMs: 120_000, httpStatus: 429, providerCode: "TooManyRequests",
    });
  });
  it.each([408, 500, 503])("keeps ambiguous status %s nonretryable despite a known Graph code", async (status) => {
    fetchMock.mockResolvedValueOnce(token()).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: "ServiceUnavailable" } }), { status }));
    await expect((await import("./graph")).graphMail.send(message)).rejects.toMatchObject({
      deliveryCode: "UNCERTAIN", retryable: false, httpStatus: status, providerCode: "ServiceUnavailable",
    });
  });
});
