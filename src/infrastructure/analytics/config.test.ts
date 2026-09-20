import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPublicAnalyticsConfig } from "./config";

const env = vi.hoisted(() => ({ ANALYTICS_ENABLED: true, SITE_URL: "https://example.test/",
  GA_MEASUREMENT_ID: "G-SYNTHETIC", DATAFAST_WEBSITE_ID: "dfid_synthetic", DATAFAST_DOMAIN: "example.test",
  DATAFAST_API_KEY: "synthetic_private_api_key", DATAFAST_BOT_TOKEN: "synthetic_private_bot_token" }));
vi.mock("@/config/env", () => ({ getEnv: () => env }));

describe("public analytics configuration", () => {
  beforeEach(() => { env.ANALYTICS_ENABLED = true; });
  it("publishes only the canonical origin and public provider identifiers", () => {
    expect(getPublicAnalyticsConfig()).toEqual({ enabled: true, siteOrigin: "https://example.test",
      datafastWebsiteId: "dfid_synthetic", datafastDomain: "example.test" });
  });
  it("omits all provider configuration when measurement is disabled", () => {
    env.ANALYTICS_ENABLED = false;
    expect(getPublicAnalyticsConfig()).toEqual({ enabled: false });
  });
});
