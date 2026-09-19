import { DEFAULT_SITE_URL } from "./env";

/** Public values only. Server credentials must never be exported from this module. */
export const siteConfig = {
  name: "TheFastestWeb",
  get url(): string {
    return new URL(process.env.SITE_URL || DEFAULT_SITE_URL).origin;
  },
} as const;
