import { parseScreenshotConfig } from "../../services/screenshot/config";
import { hash } from "../../services/screenshot/contracts";
export const token = "a".repeat(64);
export function screenshotConfig(overrides: Record<string, string | undefined> = {}) {
  return parseScreenshotConfig({ SCREENSHOT_DATABASE_URL: "postgres://fixture@localhost/tfw_test_screenshot",
    SCREENSHOT_REDIS_URL: `redis://:${"x".repeat(32)}@localhost:6379/15`, SCREENSHOT_CAPTURE_BACKEND: "local",
    SCREENSHOT_CLIENTS_JSON: JSON.stringify([{ id: "thefastestweb", namespace: "thefastestweb", tokenHash: hash(token), allowPublic: true },
      { id: "indietools", namespace: "indietools", tokenHash: hash("b".repeat(64)) }]), ...overrides });
}
