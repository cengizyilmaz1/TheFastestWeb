import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordDataFastPayment } from "./datafast";
const config = vi.hoisted(() => ({ ANALYTICS_ENABLED: true, DATAFAST_API_KEY: "df_synthetic" }));
vi.mock("@/config/env", () => ({ getEnv: () => config }));

describe("server-verified DataFast revenue transport", () => {
  const payment = { transactionId: "dodo:pay_synthetic", amountCents: 900, currency: "USD",
    visitorId: "00000000-0000-4000-8000-000000000001", timestamp: new Date("2026-09-20T10:00:00Z") };
  const fetchMock = vi.fn();
  beforeEach(() => { config.ANALYTICS_ENABLED = true; fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => vi.unstubAllGlobals());
  it("uses a stable Dodo transaction ID and sends only the bounded attribution fields", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ transaction_id: payment.transactionId }))));
    expect(await recordDataFastPayment(payment)).toEqual({ status: "recorded" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ transaction_id: payment.transactionId, amount: 9,
      currency: "USD", datafast_visitor_id: payment.visitorId, timestamp: payment.timestamp.toISOString() });
    expect(fetchMock.mock.calls[0][1].redirect).toBe("error");
  });
  it("does not claim attributed revenue for a successful response without a matching receipt", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true })));
    expect(await recordDataFastPayment(payment)).toEqual({ status: "skipped" });
  });
  it.each([[429, true], [503, true], [401, false], [400, false]])("classifies HTTP %i retries correctly", async (status, retryable) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));
    await expect(recordDataFastPayment(payment)).rejects.toMatchObject({ retryable });
  });
  it("does not contact the provider when analytics is disabled", async () => {
    config.ANALYTICS_ENABLED = false;
    expect(await recordDataFastPayment(payment)).toEqual({ status: "skipped" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
