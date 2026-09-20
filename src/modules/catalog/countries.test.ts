import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, filterCountryOptions, isCountryCode, listCountryOptions, restoreCountryCode } from "./countries";

describe("product country catalog", () => {
  it("offers all 249 ISO codes with local flags and an included license", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(249);
    for (const code of COUNTRY_CODES) {
      expect(existsSync(resolve("public/flags", `${code.toLowerCase()}.svg`)), `Missing flag for ${code}`).toBe(true);
    }
    expect(readFileSync(resolve("public/flags/LICENSE.txt"), "utf8")).toContain("Panayiotis Lipiridis");
  });
  it("finds countries by their name, ISO code, accents and common aliases", () => {
    const options = listCountryOptions();
    for (const query of ["Türkiye", "turkiye", "Turkey", " TR "]) {
      expect(filterCountryOptions(options, query).some((country) => country.code === "TR")).toBe(true);
    }
    expect(filterCountryOptions(options, "united states").map((country) => country.code)).toContain("US");
    expect(filterCountryOptions(options, "UK").map((country) => country.code)).toContain("GB");
    expect(filterCountryOptions(options, "not-a-country")).toEqual([]);
    expect(filterCountryOptions(options, "")).toHaveLength(249);
    expect(countryName("US")).toBe("United States");
  });
  it("restores only explicit supported codes from checkout drafts", () => {
    expect(restoreCountryCode("TR")).toBe("TR");
    expect(restoreCountryCode("US")).toBe("US");
    for (const value of [undefined, null, "", "EU", "ZZ", "tr", "Türkiye", 42, {}, "../../private"]) {
      expect(restoreCountryCode(value)).toBeNull();
    }
    expect(isCountryCode("ZZ")).toBe(false);
  });
  it("prioritizes an exact ISO code before country-name substring matches for keyboard selection", () => {
    const options = listCountryOptions();
    for (const query of ["US", " in ", "tr", "GB"]) {
      const matches = filterCountryOptions(options, query);
      expect(matches[0]?.code).toBe(query.trim().toUpperCase());
      expect(new Set(matches.map((country) => country.code)).size).toBe(matches.length);
    }
    expect(filterCountryOptions(options, "US").some((country) => country.code === "AU")).toBe(true);
  });
});
