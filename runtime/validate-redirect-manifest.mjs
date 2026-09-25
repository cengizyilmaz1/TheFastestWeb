#!/usr/bin/env node
import { resolve } from "node:path";
import { loadLegacyRedirectManifest } from "./legacy-redirects.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index === process.argv.length - 1) return null;
  return process.argv[index + 1];
}

const manifestPath = argument("--manifest");
const expectedDigest = argument("--digest");
if (!manifestPath || !expectedDigest || process.argv.length !== 6) {
  process.stderr.write("Usage: npm run redirects:validate -- --manifest <absolute-path> --digest <sha256>\n");
  process.exit(2);
}

try {
  const manifest = await loadLegacyRedirectManifest({
    path: resolve(manifestPath),
    expectedDigest,
  });
  process.stdout.write(`${JSON.stringify({
    valid: true,
    manifest: manifest.manifestDigest,
    routes: manifest.rules.length,
    images: manifest.badges.length,
    queryPolicies: manifest.queryPolicies.length,
  })}\n`);
} catch (error) {
  const code = error && typeof error === "object" && "code" in error
    && typeof error.code === "string" ? error.code : "REDIRECT_MANIFEST_VALIDATION_FAILED";
  process.stderr.write(`${JSON.stringify({ valid: false, code })}\n`);
  process.exit(1);
}
