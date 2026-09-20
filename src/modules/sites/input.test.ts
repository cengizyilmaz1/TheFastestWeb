import { describe, expect, it } from "vitest";
import { submissionSchema, publicationSchema } from "./input";
const valid = { url: "https://example.com", name: "Example", description: "A real website description.", category: "other", testResultId: "a4327a71-13e8-4f65-bdfc-c5d8ad16f8b1" };
describe("submission contract", () => {
  it("requires a server-issued test ID and rejects arbitrary score fields", () => {
    expect(submissionSchema.safeParse(valid).success).toBe(true);
    for (const extra of [{ speedData: { score: 100 } }, { score: 100 }, { tier: "pro" }, { ownerId: "someone-else" }, { badgeVerified: true }]) {
      expect(submissionSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(submissionSchema.safeParse({ ...valid, testResultId: undefined }).success).toBe(false);
  });
  it("requires both device proofs and preparation for the publication API", () => {
    expect(publicationSchema.safeParse(valid).success).toBe(false);
    expect(publicationSchema.safeParse({ ...valid, countryCode: "TR", preparationId: "ef413f26-7839-4053-9de5-78d2d2bcecbf", desktopTestResultId: "c8a1e936-3d93-4b2d-a8e2-0673b077de0b" }).success).toBe(true);
  });
  it("requires a real, explicit ISO country for new publications while preserving legacy nulls", () => {
    const ready = { ...valid, preparationId: "ef413f26-7839-4053-9de5-78d2d2bcecbf", desktopTestResultId: "c8a1e936-3d93-4b2d-a8e2-0673b077de0b" };
    for (const countryCode of [undefined, null, "", "ZZ", "EU", "UK", "tr", "Türkiye"]) {
      expect(publicationSchema.safeParse({ ...ready, countryCode }).success).toBe(false);
    }
    for (const countryCode of ["TR", "US", "GB", "AX", "BQ"]) {
      expect(publicationSchema.safeParse({ ...ready, countryCode }).success).toBe(true);
    }
    expect(submissionSchema.safeParse({ ...valid, countryCode: null }).success).toBe(true);
    expect(submissionSchema.safeParse({ ...valid, countryCode: "ZZ" }).success).toBe(false);
  });
});
