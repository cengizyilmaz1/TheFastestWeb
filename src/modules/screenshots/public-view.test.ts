import { describe, expect, it } from "vitest";
import { publicScreenshot } from "./public-view";

const now = new Date("2026-09-20T12:00:00Z");
const config = { publicBaseUrl: "https://media.example.com", clientId: "thefastestweb" };
const objectKey = "thefastestweb/sites/screenshots/desktop/capture/lease/image.webp";
const ready = {
  siteUrl: "https://example.com/", isListed: true, archivedAt: null, lifecycle: "active",
  sourceUrl: "https://example.com/", status: "ready", contentType: "image/webp", objectKey,
  publicUrl: `${config.publicBaseUrl}/${objectKey}`, width: 1440, height: 900,
  capturedAt: new Date("2026-09-20T11:00:00Z"), retentionUntil: new Date("2026-10-20T11:00:00Z"),
};

describe("public screenshot publication", () => {
  it("returns only display fields for a current approved WebP", () => {
    const capture = { ...ready, ownerId: "private-account", serviceJobId: "private-job", sourceUrl: "https://example.com/" };
    expect(publicScreenshot(capture, config, now)).toEqual({
      url: ready.publicUrl, width: 1440, height: 900, capturedAt: "2026-09-20T11:00:00.000Z",
    });
  });

  it.each([
    { isListed: false }, { archivedAt: new Date("2026-09-19") },
    ...["verified", "unreachable", "redirected", "parked", "pending", "rejected"].map((lifecycle) => ({ lifecycle })),
    { status: "expired" }, { status: "removed" }, { contentType: "image/jpeg" },
  ])("hides a capture when its publication state is %j", (state) => {
    expect(publicScreenshot({ ...ready, ...state }, config, now)).toBeNull();
  });

  it("withholds a screenshot when the listing URL changes and ignores tracking parameters only", () => {
    for (const siteUrl of ["https://different.example.com/", "http://example.com/", "https://www.example.com/", "https://example.com/new", "https://example.com/?account=other", "http://127.0.0.1/"]) {
      expect(publicScreenshot({ ...ready, siteUrl }, config, now)).toBeNull();
    }
    expect(publicScreenshot({ ...ready, siteUrl: "https://example.com/?utm_source=directory#preview" }, config, now)).not.toBeNull();
  });

  it.each([
    { retentionUntil: null }, { retentionUntil: new Date("invalid") }, { retentionUntil: now },
    { retentionUntil: new Date(now.getTime() - 1) }, { capturedAt: new Date("invalid") },
    { capturedAt: new Date(now.getTime() + 60_001) },
    { capturedAt: new Date(now.getTime() + 1), retentionUntil: new Date(now.getTime() + 1) },
  ])("withholds expired or unverifiable capture times %j", (times) => {
    expect(publicScreenshot({ ...ready, ...times }, config, now)).toBeNull();
  });

  it("rejects unrelated R2 keys, JPEG originals, traversal and URL transformations", () => {
    for (const key of ["indietools/sites/screenshots/capture/image.webp", "thefastestweb/private/image.webp", objectKey.replace(".webp", ".jpg"), objectKey.replace("capture/", "../"), objectKey.replace("capture/", "./"), objectKey.replace("capture/", "/"), objectKey.replace("capture/", "capture\\")]) {
      expect(publicScreenshot({ ...ready, objectKey: key, publicUrl: `${config.publicBaseUrl}/${key}` }, config, now)).toBeNull();
    }
    for (const publicUrl of [
      `https://untrusted.example.com/${objectKey}`, ready.publicUrl + "?token=secret", ready.publicUrl + "#fragment",
      ready.publicUrl.replace("https://", "http://"), ready.publicUrl.replace("https://", "https://user:pass@"),
      `${config.publicBaseUrl}/other/../${objectKey}`,
    ]) expect(publicScreenshot({ ...ready, publicUrl }, config, now)).toBeNull();
  });

  it("rejects malformed public configuration and image dimensions", () => {
    for (const publicBaseUrl of ["", "http://media.example.com", "https://user:secret@media.example.com", "https://media.example.com/path", "https://media.example.com?secret=true"]) {
      expect(publicScreenshot(ready, { ...config, publicBaseUrl }, now)).toBeNull();
    }
    for (const dimensions of [{ width: 0 }, { height: -1 }, { width: 1440.5 }, { width: 16_385 }, { height: 32_769 }]) {
      expect(publicScreenshot({ ...ready, ...dimensions }, config, now)).toBeNull();
    }
  });
});
