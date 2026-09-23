import { z } from "zod";
import { categorySlugs } from "@/modules/catalog/categories";
import { isCountryCode } from "@/modules/catalog/countries";

/** Shared browser/server rules; public-address resolution remains server-side. */
export const countryCodeSchema = z.string({ error: "Choose your product's country of origin." })
  .refine(isCountryCode, "Choose your product's country of origin.");

export const listingFields = {
  url: z.string().trim().min(1, "Enter your website URL.").max(4096),
  name: z.string().trim().min(2, "Enter a website name with at least 2 characters.").max(60, "Keep the website name within 60 characters."),
  description: z.string().trim().min(10, "Describe your website in at least 10 characters.").max(500, "Keep the description within 500 characters."),
  twitterHandle: z.string().trim().max(30).regex(/^@?[a-zA-Z0-9_]*$/, "Enter a valid X handle or leave it blank.").optional(),
  category: z.enum(categorySlugs, { error: "Choose a category for your website." }),
  faviconUrl: z.string().trim().max(4096).optional(),
};

export const listingDetailsSchema = z.object({ ...listingFields, countryCode: countryCodeSchema });
