import { DEFAULT_SITE_URL } from "./env";

/** Public values only. Server credentials must never be exported from this module. */
export const siteConfig = {
  get name(): string { return process.env.SITE_NAME || "TheFastestWeb"; },
  ownerName: "Cengiz YILMAZ",
  ownerUrl: "https://cengizyilmaz.net",
  get email(): string { return process.env.SITE_EMAIL || "cengiz@domain.com"; },
  get indieToolsUrl(): string { return process.env.INDIETOOLS_URL || "https://www.indietools.app"; },
  get isDemo(): boolean { return process.env.DEPLOYMENT_MODE === "demo"; },
  get url(): string {
    return new URL(process.env.SITE_URL || DEFAULT_SITE_URL).origin;
  },
} as const;
