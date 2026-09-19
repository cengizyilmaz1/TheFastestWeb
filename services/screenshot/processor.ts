import { putObject, deleteObject } from "../../src/infrastructure/storage/r2";
import { CaptureError, type CapturedImages } from "./capture";
import { hash, prepareCapture, type PreparedCapture, type ImageArtifact } from "./contracts";
import type { ScreenshotConfig } from "./config";
import type { ScreenshotRepository } from "./repository";

export type ScreenshotStorage = { put: typeof putObject; remove: typeof deleteObject };
export const screenshotStorage: ScreenshotStorage = { put: putObject, remove: deleteObject };

export function createCaptureProcessor(config: ScreenshotConfig, repository: ScreenshotRepository,
  capture: (input: PreparedCapture) => Promise<CapturedImages>, storage: ScreenshotStorage = screenshotStorage) {
  return async (id: string) => {
    const row = await repository.claim(id);
    if (!row) return;
    try { row.request = prepareCapture(row.request); }
    catch { await repository.fail(row, "INVALID_REQUEST", true); return; }
    const client = config.clients.find((candidate) => candidate.id === row.client_id);
    if (!client || (row.request.visibility === "public" && !client.allowPublic)) {
      await repository.fail(row, "CLIENT_DISABLED", true);
      return;
    }
    try {
      const images = await capture(row.request);
      // Lease-specific paths prevent a late worker deleting/replacing a newer
      // worker's successful image while cleaning up its own abandoned upload.
      const prefix = `${client.namespace}/sites/screenshots/${row.request.device}/${row.id}/${row.lease_token}`;
      const originalKey = `${prefix}/${hash(images.original)}.jpg`, optimizedKey = `${prefix}/${hash(images.optimized)}.webp`;
      await repository.stageObjects(row, [originalKey, optimizedKey]);
      const uploadedOriginal = await storage.put({ bytes: images.original, contentType: "image/jpeg", objectKey: originalKey, visibility: row.request.visibility });
      const uploadedOptimized = await storage.put({ bytes: images.optimized, contentType: "image/webp", objectKey: optimizedKey, visibility: row.request.visibility });
      const metadata = (bytes: Buffer, objectKey: string, contentType: ImageArtifact["contentType"], publicUrl: string | null): ImageArtifact => ({
        objectKey, ...(publicUrl ? { publicUrl } : {}), width: images.width, height: images.height, contentType, size: bytes.length, hash: hash(bytes),
      });
      await repository.complete(row, {
        original: metadata(images.original, originalKey, "image/jpeg", uploadedOriginal.publicUrl),
        optimized: metadata(images.optimized, optimizedKey, "image/webp", uploadedOptimized.publicUrl),
        finalUrl: images.finalUrl, title: images.title, capturedAt: new Date().toISOString(), retentionUntil: row.expires_at.toISOString(),
      });
    } catch (error) {
      const code = error instanceof CaptureError ? error.code : "CAPTURE_FAILED";
      await repository.fail(row, code, ["URL_BLOCKED", "CAPTURE_TOO_LARGE"].includes(code));
    }
  };
}

export async function cleanExpiredCaptures(repository: ScreenshotRepository, storage: ScreenshotStorage = screenshotStorage) {
  const objects = await repository.objectsToDelete();
  // Four concurrent bounded R2 operations, at most four batches per sweep.
  // Failed deletion keeps its ledger row so the next sweep can retry it.
  for (let index = 0; index < objects.length; index += 4) {
    await Promise.all(objects.slice(index, index + 4).map(async (object) => {
      await storage.remove(object.object_key, object.visibility);
      await repository.forgetObject(object.object_key);
    }));
  }
  for (const row of await repository.expired()) await repository.markExpired(row.id);
  await repository.prune();
}
