import { describe, expect, it } from "vitest";
import { submissionSchema } from "./input";
const valid = { url: "https://example.com", name: "Example", description: "A real website description.", category: "other", testResultId: "a4327a71-13e8-4f65-bdfc-c5d8ad16f8b1" };
describe("submission contract", () => {
  it("requires a server-issued test ID and rejects arbitrary score fields", () => {
    expect(submissionSchema.safeParse(valid).success).toBe(true);
    for (const extra of [{ speedData: { score: 100 } }, { score: 100 }, { tier: "pro" }, { ownerId: "someone-else" }, { badgeVerified: true }]) {
      expect(submissionSchema.safeParse({ ...valid, ...extra }).success).toBe(false);
    }
    expect(submissionSchema.safeParse({ ...valid, testResultId: undefined }).success).toBe(false);
  });
});
