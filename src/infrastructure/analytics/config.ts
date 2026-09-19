import { getEnv } from "@/config/env";
import type { PublicAnalyticsConfig } from "./consent";

export function getPublicAnalyticsConfig(): PublicAnalyticsConfig {
  const env = getEnv();
  // Public identifiers only; server credentials never cross this boundary.
  return { enabled: env.ANALYTICS_ENABLED, ...(env.ANALYTICS_ENABLED ? {
    gaId: env.GA_MEASUREMENT_ID, datafastWebsiteId: env.DATAFAST_WEBSITE_ID, datafastDomain: env.DATAFAST_DOMAIN,
  } : {}) };
}
