import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp, { type OutputInfo } from "sharp";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/http/errors";

export type MediaVisibility = "private" | "public";
export type ImageContentType = "image/png" | "image/jpeg" | "image/webp" | "image/avif";
export type StoredObject = {
  objectKey: string; publicUrl: string | null; contentType: ImageContentType;
  size: number; hash: string; visibility: MediaVisibility;
};
const maxObjectBytes = 16 * 1024 * 1024;
const maxPixels = 40_000_000;
const contentTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif"]);

export function isStorageEnabled(): boolean { return getEnv().STORAGE_ENABLED; }

export function validateObjectKey(value: string): string {
  if (value.length > 512 || !/^[a-z0-9][a-z0-9_-]{1,63}\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+$/.test(value)
    || value.split("/").some((part) => part === "." || part === ".." || part.includes(".."))) {
    throw new AppError("INVALID_REQUEST", "The media object key is invalid.", 400);
  }
  return value;
}

function storage(visibility: MediaVisibility) {
  const env = getEnv();
  if (!env.STORAGE_ENABLED) throw new AppError("FEATURE_DISABLED", "Media storage is unavailable.", 503);
  const bucket = visibility === "private" ? env.R2_PRIVATE_BUCKET : env.R2_BUCKET;
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !bucket
    || (visibility === "public" && !env.R2_PUBLIC_BASE_URL)) {
    throw new AppError("FEATURE_DISABLED", "Media storage is not configured.", 503);
  }
  const client = new S3Client({
    region: "auto", endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
    maxAttempts: 2, requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  return { client, bucket, publicBaseUrl: env.R2_PUBLIC_BASE_URL };
}

export async function putObject(input: {
  bytes: Buffer; contentType: ImageContentType; objectKey: string; visibility?: MediaVisibility;
}): Promise<StoredObject> {
  const visibility = input.visibility ?? "private";
  const objectKey = validateObjectKey(input.objectKey);
  if (!contentTypes.has(input.contentType) || input.bytes.length < 1 || input.bytes.length > maxObjectBytes) {
    throw new AppError("INVALID_REQUEST", "The image type or size is not supported.", 400);
  }
  const { client, bucket, publicBaseUrl } = storage(visibility);
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  try {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: objectKey, Body: input.bytes, ContentType: input.contentType,
      ContentLength: input.bytes.length, Metadata: { sha256: hash },
      CacheControl: visibility === "public" ? "public, max-age=86400" : "private, no-store",
    }), { abortSignal: AbortSignal.timeout(15_000) });
    return { objectKey, visibility, publicUrl: visibility === "public"
      ? `${publicBaseUrl!.replace(/\/$/, "")}/${objectKey.split("/").map(encodeURIComponent).join("/")}` : null,
    contentType: input.contentType, size: input.bytes.length, hash };
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "The image could not be stored.", 503);
  } finally { client.destroy(); }
}

/** Decode and re-encode: rejects SVG and strips EXIF/metadata from generated public media. */
export async function putOptimizedImage(input: {
  bytes: Buffer; keyPrefix: string; visibility?: MediaVisibility; maxWidth?: number; maxHeight?: number;
}): Promise<StoredObject & { width: number; height: number }> {
  validateObjectKey(`${input.keyPrefix}/validation.webp`);
  if (!input.bytes.length || input.bytes.length > maxObjectBytes) throw new AppError("INVALID_REQUEST", "The image is too large.", 400);
  const width = input.maxWidth ?? 2560, height = input.maxHeight ?? 2560;
  if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= 4096)) {
    throw new AppError("INVALID_REQUEST", "The image dimensions are invalid.", 400);
  }
  let output: { data: Buffer; info: OutputInfo };
  try {
    const decoder = sharp(input.bytes, { limitInputPixels: maxPixels, failOn: "error", animated: false });
    const metadata = await decoder.metadata();
    if (!["png", "jpeg", "webp", "heif", "avif"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error("Unsupported image");
    output = await decoder.rotate().resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new AppError("INVALID_REQUEST", "The image could not be decoded safely.", 400);
  }
  const { data, info } = output;
  const hash = createHash("sha256").update(data).digest("hex");
  const stored = await putObject({ bytes: data, objectKey: `${input.keyPrefix}/${hash}.webp`,
    contentType: "image/webp", visibility: input.visibility });
  return { ...stored, width: info.width, height: info.height };
}

export async function readObject(objectKey: string, options: { visibility?: MediaVisibility; maxBytes?: number } = {}): Promise<{ bytes: Buffer; contentType: ImageContentType }> {
  validateObjectKey(objectKey);
  const limit = Math.min(options.maxBytes ?? maxObjectBytes, maxObjectBytes);
  if (!Number.isInteger(limit) || limit < 1) throw new AppError("INVALID_REQUEST", "The media limit is invalid.", 400);
  const { client, bucket } = storage(options.visibility ?? "private");
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { abortSignal: AbortSignal.timeout(15_000) });
    if (!result.Body || !contentTypes.has(result.ContentType ?? "") || (result.ContentLength ?? 0) > limit) throw new Error("Invalid image response");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > limit) throw new Error("Image response exceeded limit");
      chunks.push(Buffer.from(chunk));
    }
    if (!size) throw new Error("Empty image response");
    return { bytes: Buffer.concat(chunks), contentType: result.ContentType as ImageContentType };
  } catch {
    throw new AppError("UPSTREAM_UNAVAILABLE", "The image could not be retrieved.", 503);
  } finally { client.destroy(); }
}

export async function deleteObject(objectKey: string, visibility: MediaVisibility = "private"): Promise<void> {
  validateObjectKey(objectKey);
  const { client, bucket } = storage(visibility);
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }), { abortSignal: AbortSignal.timeout(15_000) });
  } catch { throw new AppError("UPSTREAM_UNAVAILABLE", "The image could not be removed.", 503); }
  finally { client.destroy(); }
}

export async function getSignedReadUrl(objectKey: string, options: { visibility?: MediaVisibility; expiresInSeconds?: number } = {}): Promise<string> {
  validateObjectKey(objectKey);
  const expiresIn = options.expiresInSeconds ?? 300;
  if (!Number.isInteger(expiresIn) || expiresIn < 30 || expiresIn > 900) throw new AppError("INVALID_REQUEST", "The access duration is invalid.", 400);
  const { client, bucket } = storage(options.visibility ?? "private");
  try { return await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn }); }
  catch { throw new AppError("UPSTREAM_UNAVAILABLE", "Temporary image access is unavailable.", 503); }
  finally { client.destroy(); }
}
