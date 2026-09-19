import { timingSafeEqual } from "node:crypto";
import { hash } from "./contracts";
import type { ScreenshotClient } from "./config";

export function authenticateClient(header: string | undefined, clients: readonly ScreenshotClient[]): ScreenshotClient | null {
  if (!header || header.length > 256) return null;
  const match = /^Bearer ([a-z][a-z0-9-]{1,39})\.([a-f0-9]{64})$/.exec(header);
  if (!match) return null;
  const client = clients.find((candidate) => candidate.id === match[1]);
  const expected = Buffer.from(client?.tokenHash ?? "0".repeat(64), "hex");
  const supplied = Buffer.from(hash(match[2]), "hex");
  return timingSafeEqual(supplied, expected) && client ? client : null;
}
