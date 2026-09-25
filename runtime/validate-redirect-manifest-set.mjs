#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadLegacyRedirectManifest } from "./legacy-redirects.mjs";

const directory = resolve(import.meta.dirname, "redirect-manifests");
try {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.name.endsWith(".json"));
  if (entries.some((entry) => !entry.isFile()) || entries.length > 1) {
    throw Object.assign(new Error("REDIRECT_MANIFEST_RELEASE_SET_INVALID"), {
      code: "REDIRECT_MANIFEST_RELEASE_SET_INVALID",
    });
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    const parsed = JSON.parse(await readFile(path, "utf8"));
    await loadLegacyRedirectManifest({ path, expectedDigest: parsed.manifestDigest });
  }
  process.stdout.write(`${JSON.stringify({ valid: true, manifests: entries.length })}\n`);
} catch (error) {
  const code = error && typeof error === "object" && "code" in error
    && typeof error.code === "string" ? error.code : "REDIRECT_MANIFEST_RELEASE_SET_INVALID";
  process.stderr.write(`${JSON.stringify({ valid: false, code })}\n`);
  process.exit(1);
}
