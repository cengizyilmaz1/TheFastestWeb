import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const state = vi.hoisted(() => ({ send: vi.fn(), destroy: vi.fn(), enabled: true }));
vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = state.send; destroy = state.destroy; },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://private.example.test/signed") }));
vi.mock("@/config/env", () => ({ getEnv: () => ({ STORAGE_ENABLED: state.enabled,
  R2_ACCOUNT_ID: "a".repeat(32), R2_ACCESS_KEY_ID: "synthetic", R2_SECRET_ACCESS_KEY: "synthetic",
  R2_BUCKET: "public-fixture", R2_PRIVATE_BUCKET: "private-fixture", R2_PUBLIC_BASE_URL: "https://media.example.test",
}) }));
import { getSignedReadUrl, putObject, putOptimizedImage, readObject, validateObjectKey } from "./r2";

describe("isolated R2 image storage", () => {
  beforeEach(() => { state.enabled = true; state.send.mockReset().mockResolvedValue({}); state.destroy.mockClear(); });
  it.each(["../secret", "thefastestweb/../../other.png", "/thefastestweb/image.png", "thefastestweb/%2e%2e/key", "thefastestweb/a?b.png", "thefastestweb//x"])("rejects unsafe object key %s", (key) => {
    expect(() => validateObjectKey(key)).toThrow();
  });
  it("keeps private objects in the private bucket without public URLs", async () => {
    const result = await putObject({ bytes: Buffer.from("synthetic-image"), contentType: "image/png", objectKey: "indietools/drafts/image.png" });
    expect(result.publicUrl).toBeNull();
    expect(result.visibility).toBe("private");
    expect(state.send.mock.calls[0][0].input.Bucket).toBe("private-fixture");
    expect(state.send.mock.calls[0][0].input.CacheControl).toBe("private, no-store");
    expect(state.destroy).toHaveBeenCalled();
  });
  it("re-encodes raster images to bounded WebP and uses their content hash", async () => {
    const input = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#222222" } }).png().toBuffer();
    const result = await putOptimizedImage({ bytes: input, keyPrefix: "thefastestweb/sites/screenshots", visibility: "public", maxWidth: 40 });
    expect(result).toMatchObject({ width: 40, height: 20, contentType: "image/webp", visibility: "public" });
    expect(result.objectKey).toMatch(/^thefastestweb\/sites\/screenshots\/[a-f0-9]{64}\.webp$/);
    expect(result.publicUrl).toBe(`https://media.example.test/${result.objectKey}`);
    const metadata = await sharp(state.send.mock.calls[0][0].input.Body).metadata();
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects active SVG input before any upload", async () => {
    await expect(putOptimizedImage({ bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'), keyPrefix: "thefastestweb/sites" }))
      .rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(state.send).not.toHaveBeenCalled();
  });
  it("bounds streamed downloads even without ContentLength", async () => {
    state.send.mockResolvedValue({ ContentType: "image/png", Body: (async function* () { yield Buffer.alloc(6); yield Buffer.alloc(6); })() });
    await expect(readObject("thefastestweb/private/image.png", { maxBytes: 10 })).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(state.destroy).toHaveBeenCalled();
  });
  it("fails closed without enabled storage and bounds signed URL lifetimes", async () => {
    state.enabled = false;
    await expect(putObject({ bytes: Buffer.from("image"), contentType: "image/png", objectKey: "thefastestweb/image.png" }))
      .rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(state.send).not.toHaveBeenCalled();
    await expect(getSignedReadUrl("thefastestweb/image.png", { expiresInSeconds: 3600 })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
