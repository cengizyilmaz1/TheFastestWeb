import { describe, expect, it } from "vitest";
import { slugify } from "./utils";

describe("slugify", () => {
  it("keeps plain names as kebab case", () => {
    expect(slugify("Pixel Arcade Studio")).toBe("pixel-arcade-studio");
    expect(slugify("launch.cab")).toBe("launch-cab");
    expect(slugify("  200+ Free Tools!  ")).toBe("200-free-tools");
  });

  it("transliterates Turkish and accented letters instead of dropping them", () => {
    expect(slugify("Denizli Çilingir ve Anahtarcı")).toBe("denizli-cilingir-ve-anahtarci");
    expect(slugify("İstanbul Şişli Öğün Ürünleri")).toBe("istanbul-sisli-ogun-urunleri");
    expect(slugify("Café Münchën Straße")).toBe("cafe-munchen-strasse");
  });

  it("returns an empty string when nothing is usable", () => {
    expect(slugify("日本語")).toBe("");
    expect(slugify("---")).toBe("");
  });
});
