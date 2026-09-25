import { createHash } from "node:crypto";
import { basename, isAbsolute, resolve } from "node:path";
import { lstat, readFile } from "node:fs/promises";

const MANIFEST_VERSION = "THEFASTESTWEB_REDIRECTS_V1";
const SOURCE_ORIGIN = "https://thefastestweb.site";
const DESTINATION_ORIGIN = "https://www.indietools.app";
const MEDIA_ORIGIN = "https://media.indietools.app";
const MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_TARGET_BYTES = 8 * 1024;
const MANIFEST_FILE = /^thefastestweb-redirects-v1-([a-f0-9]{16})[.]json$/u;
const HASH = /^[a-f0-9]{64}$/u;
const SAFE_SOURCE_PATH = /^\/[A-Za-z0-9._~:/-]*$/u;
const TRACKING_PARAMETER = /^(?:utm_[a-z0-9_]+|gclid|dclid|fbclid|msclkid|ref|referrer)$/u;
const SPEED_BADGE_VARIANTS = new Set(["scorecard", "speedometer", "glow"]);
const SPEED_BADGE_THEMES = new Set(["light", "dark"]);
const COVERAGE_KEYS = [
  "knownRoutes",
  "redirects",
  "gone",
  "review",
  "sourceSites",
  "sourceCategories",
  "sourceArticles",
  "sourceFounders",
  "sourceManagedRedirects",
  "managedRedirects",
  "managedRedirectReview",
  "badgeMappings",
  "badgeReview",
  "badgeGone",
  "queryPolicies",
];

export class LegacyRedirectConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "LegacyRedirectConfigurationError";
    this.code = code;
  }
}

function fail(code) {
  throw new LegacyRedirectConfigurationError(code);
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const permitted = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.hasOwn(value, key))
    && keys.every((key) => permitted.has(key));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function manifestDigest(manifest) {
  const stable = { ...manifest };
  delete stable.generatedAt;
  delete stable.manifestDigest;
  return sha256(stableJson(stable));
}

function canonicalManifestPath(path) {
  if (typeof path !== "string" || path.length < 1 || path.length > 2048) {
    fail("REDIRECT_SOURCE_PATH_INVALID");
  }
  if (!SAFE_SOURCE_PATH.test(path) || path.startsWith("//") || path.includes("//")
    || path.includes("\\") || path.includes("?") || path.includes("#")
    || path.includes("/../") || path.includes("/./") || path.endsWith("/..")
    || path.endsWith("/.")) {
    fail("REDIRECT_SOURCE_PATH_INVALID");
  }
  if (path !== "/" && path.endsWith("/")) fail("REDIRECT_SOURCE_PATH_NOT_CANONICAL");
  return path;
}

function allowedDestinationPath(destination) {
  return [
    /^\/speed$/u,
    /^\/speed\/[a-z0-9]+(?:-[a-z0-9]+)*$/u,
    /^\/speed\/[0-9]{4}\/week-(?:[1-9]|[1-4][0-9]|5[0-3])$/u,
    /^\/speed\/[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}\/week-(?:[1-9]|[1-4][0-9]|5[0-3])$/u,
    /^\/products\/[a-z0-9-]+$/u,
    /^\/blog(?:$|\/[a-z0-9-]+$)/u,
    /^\/founders\/[a-z0-9-]+$/u,
    /^\/(?:about|privacy-policy|terms-of-service|submit|signin)$/u,
    /^\/pricing(?:#advertise-14)?$/u,
    /^\/(?:robots[.]txt|llms[.]txt|llms-full[.]txt|llms-full\/(?:speed-results|founders|articles)[.]txt|sitemap[.]xml|api\/md\/_catalog)$/u,
    /^\/(?:speed|about|blog|pricing|privacy-policy|terms-of-service)[.]md$/u,
    /^\/blog\/[a-z0-9-]+[.]md$/u,
  ].some((pattern) => pattern.test(destination));
}

function validateDestination(destination) {
  if (typeof destination !== "string" || destination.length > 2048
    || /[\r\n]/u.test(destination)) fail("REDIRECT_DESTINATION_INVALID");
  let relative = destination;
  if (/^https?:\/\//iu.test(destination)) {
    let parsed;
    try { parsed = new URL(destination); } catch { fail("REDIRECT_DESTINATION_INVALID"); }
    if (parsed.origin !== DESTINATION_ORIGIN || parsed.username || parsed.password) {
      fail("REDIRECT_DESTINATION_ORIGIN_REFUSED");
    }
    relative = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  if (!relative.startsWith("/") || relative.startsWith("//") || !allowedDestinationPath(relative)) {
    fail("REDIRECT_DESTINATION_PATTERN_REFUSED");
  }
  const parsed = new URL(relative, DESTINATION_ORIGIN);
  if (parsed.origin !== DESTINATION_ORIGIN) fail("REDIRECT_DESTINATION_ORIGIN_REFUSED");
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function validateRule(value) {
  if (!exactKeys(value, [
    "sourcePath", "disposition", "status", "destination", "entityType",
    "sourceEntityId", "reason",
  ])) fail("REDIRECT_RULE_SCHEMA_INVALID");
  const sourcePath = canonicalManifestPath(value.sourcePath);
  if (!["redirect", "gone", "review"].includes(value.disposition)
    || !["home", "site", "category", "article", "founder", "static", "managed"].includes(value.entityType)
    || typeof value.sourceEntityId !== "string" || value.sourceEntityId.length < 1 || value.sourceEntityId.length > 512
    || typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 4000) {
    fail("REDIRECT_RULE_SCHEMA_INVALID");
  }
  if (value.disposition === "redirect") {
    if (value.status !== 301) fail("REDIRECT_RULE_STATUS_INVALID");
    return { ...value, sourcePath, destination: validateDestination(value.destination) };
  }
  if (value.destination !== null) fail("REDIRECT_RULE_DESTINATION_INVALID");
  if (value.disposition === "gone" && value.status !== 410) fail("REDIRECT_RULE_STATUS_INVALID");
  if (value.disposition === "review" && value.status !== 0) fail("REDIRECT_RULE_STATUS_INVALID");
  return { ...value, sourcePath };
}

function validateBadge(value) {
  if (!exactKeys(value, [
    "sourceType", "sourceEntityId", "sourceImagePath", "destinationImage",
    "targetHref", "status", "reason", "requiredContentType",
    "preserveQueryParameters", "queryAdapter",
  ])) fail("REDIRECT_IMAGE_SCHEMA_INVALID");
  const sourceImagePath = canonicalManifestPath(value.sourceImagePath);
  const sourceShapeValid = value.sourceType === "badge"
    ? /^\/api\/badge\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourceImagePath)
    : value.sourceType === "avatar"
      ? /^\/api\/avatar\/(?:[a-z0-9]+(?:-[a-z0-9]+)*|:handle)$/u.test(sourceImagePath)
      : value.sourceType === "award"
        ? /^\/api\/awards\/(?:[a-zA-Z0-9-]+|:id)\/(?:embed[.]svg|share[.]png)$/u.test(sourceImagePath)
        : value.sourceType === "image"
          ? /^\/images\/[A-Za-z0-9._~/-]+$/u.test(sourceImagePath) && !sourceImagePath.includes(":")
          : false;
  if (!sourceShapeValid
    || typeof value.sourceEntityId !== "string" || value.sourceEntityId.length < 1 || value.sourceEntityId.length > 192
    || !["mapped", "gone", "review"].includes(value.status)
    || typeof value.reason !== "string" || value.reason.length < 1 || value.reason.length > 4000
    || !["image/svg+xml", "image/png", "image/*"].includes(value.requiredContentType)
    || !Array.isArray(value.preserveQueryParameters)
    || value.preserveQueryParameters.some((item) => item !== "theme" && item !== "variant")) {
    fail("REDIRECT_IMAGE_SCHEMA_INVALID");
  }
  // The V1 edge adapter strips every raw parameter and writes one canonical
  // theme and variant itself. A manifest must never ask the edge to preserve input.
  if (value.preserveQueryParameters.length !== 0) fail("REDIRECT_IMAGE_QUERY_POLICY_INVALID");
  if (value.status === "review" || value.status === "gone") {
    if (value.destinationImage !== null || value.targetHref !== null || value.queryAdapter !== null) {
      fail("REDIRECT_IMAGE_REVIEW_INVALID");
    }
    return { ...value, sourceImagePath };
  }
  if (typeof value.destinationImage !== "string") fail("REDIRECT_IMAGE_MAPPING_INVALID");
  let destination;
  try { destination = new URL(value.destinationImage, DESTINATION_ORIGIN); } catch {
    fail("REDIRECT_IMAGE_MAPPING_INVALID");
  }
  if (![DESTINATION_ORIGIN, MEDIA_ORIGIN].includes(destination.origin)
    || destination.username || destination.password || destination.search || destination.hash
    || destination.pathname.includes("//")) fail("REDIRECT_IMAGE_MAPPING_INVALID");
  const extension = destination.pathname.toLowerCase();
  const matchesContentType = value.requiredContentType === "image/svg+xml"
    ? extension.endsWith(".svg")
    : value.requiredContentType === "image/png"
      ? extension.endsWith(".png")
      : /[.](?:avif|gif|jpe?g|png|svg|webp)$/u.test(extension);
  if (!matchesContentType) fail("REDIRECT_IMAGE_CONTENT_TYPE_INVALID");
  if (value.sourceType === "badge") {
    if (destination.origin !== DESTINATION_ORIGIN
      || !/^\/badges\/speed\/[a-z0-9]+(?:-[a-z0-9]+)*[.]svg$/u.test(destination.pathname)
      || value.requiredContentType !== "image/svg+xml"
      || value.queryAdapter !== "legacy-speed-badge-v1"
      || typeof value.targetHref !== "string") fail("REDIRECT_IMAGE_MAPPING_INVALID");
    validateDestination(value.targetHref);
  } else if (value.targetHref !== null || value.queryAdapter !== null) {
    fail("REDIRECT_IMAGE_MAPPING_INVALID");
  }
  return { ...value, sourceImagePath, destinationImage: destination.toString() };
}

function validateQueryPolicy(value, rulesByPath) {
  if (!exactKeys(value, ["sourcePath", "adapter", "acceptedParameters"])) {
    fail("REDIRECT_QUERY_POLICY_SCHEMA_INVALID");
  }
  const sourcePath = canonicalManifestPath(value.sourcePath);
  const rule = rulesByPath.get(sourcePath);
  if (value.adapter !== "legacy-pagination-consolidation-v1"
    || !Array.isArray(value.acceptedParameters)
    || value.acceptedParameters.length !== 1
    || value.acceptedParameters[0] !== "page"
    || !rule || rule.disposition !== "redirect"
    || !(sourcePath === "/blog" || /^\/fastest\/[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourcePath))) {
    fail("REDIRECT_QUERY_POLICY_INVALID");
  }
  return { sourcePath, adapter: value.adapter, acceptedParameters: ["page"] };
}

function validateCoverage(value, rules, badges, queryPolicies) {
  if (!isRecord(value) || !COVERAGE_KEYS.every((key) => Object.hasOwn(value, key))
    || Object.keys(value).some((key) => !COVERAGE_KEYS.includes(key))) {
    fail("REDIRECT_COVERAGE_SCHEMA_INVALID");
  }
  for (const key of COVERAGE_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("REDIRECT_COVERAGE_SCHEMA_INVALID");
  }
  const expected = {
    knownRoutes: rules.length,
    redirects: rules.filter((item) => item.disposition === "redirect").length,
    gone: rules.filter((item) => item.disposition === "gone").length,
    review: rules.filter((item) => item.disposition === "review").length,
    sourceSites: rules.filter((item) => item.entityType === "site").length,
    sourceCategories: rules.filter((item) => item.entityType === "category" && item.sourcePath.startsWith("/fastest/")).length,
    sourceArticles: rules.filter((item) => item.entityType === "article" && item.sourcePath.startsWith("/blog/")).length,
    sourceFounders: rules.filter((item) => item.entityType === "founder" && !item.sourceEntityId.includes(":alias:")).length,
    sourceManagedRedirects: rules.filter((item) => item.entityType === "managed").length,
    managedRedirects: rules.filter((item) => item.entityType === "managed" && item.disposition === "redirect").length,
    managedRedirectReview: rules.filter((item) => item.entityType === "managed" && item.disposition === "review").length,
    badgeMappings: badges.filter((item) => item.status === "mapped").length,
    badgeReview: badges.filter((item) => item.status === "review").length,
    badgeGone: badges.filter((item) => item.status === "gone").length,
    queryPolicies: queryPolicies.length,
  };
  for (const [key, count] of Object.entries(expected)) {
    if (value[key] !== count) fail(`REDIRECT_COVERAGE_INVALID_${key.toUpperCase()}`);
  }
}

/** Validates both the checksummed artifact and every activation invariant. */
export function validateLegacyRedirectManifest(value, options = {}) {
  if (!exactKeys(value, [
    "schemaVersion", "manifestVersion", "sourceTreeSha256", "sourceDumpSha256",
    "generatedAt", "origin", "destinationOrigin", "unknownPathPolicy", "rules",
    "badges", "coverage", "manifestDigest",
    "queryPolicies",
  ])) fail("REDIRECT_MANIFEST_SCHEMA_INVALID");
  if (value.schemaVersion !== 1 || value.manifestVersion !== MANIFEST_VERSION
    || value.origin !== SOURCE_ORIGIN || value.destinationOrigin !== DESTINATION_ORIGIN
    || value.unknownPathPolicy !== 410 || !HASH.test(value.sourceTreeSha256)
    || !HASH.test(value.sourceDumpSha256) || !HASH.test(value.manifestDigest)
    || typeof value.generatedAt !== "string" || !Number.isFinite(Date.parse(value.generatedAt))
    || !Array.isArray(value.rules) || !Array.isArray(value.badges)
    || value.rules.length > 250_000 || value.badges.length > 250_000) {
    fail("REDIRECT_MANIFEST_HEADER_INVALID");
  }

  const rules = value.rules.map(validateRule);
  const badges = value.badges.map(validateBadge);
  const rulesByPath = new Map();
  for (const rule of rules) {
    if (rulesByPath.has(rule.sourcePath)) fail("REDIRECT_SOURCE_COLLISION");
    rulesByPath.set(rule.sourcePath, rule);
  }
  const badgesByPath = new Map();
  const badgePatterns = [];
  for (const badge of badges) {
    if (badgesByPath.has(badge.sourceImagePath) || rulesByPath.has(badge.sourceImagePath)) {
      fail("REDIRECT_IMAGE_SOURCE_COLLISION");
    }
    badgesByPath.set(badge.sourceImagePath, badge);
    if (badge.sourceImagePath === "/api/avatar/:handle") {
      badgePatterns.push({ pattern: /^\/api\/avatar\/[^/]+$/u, badge });
    } else if (badge.sourceImagePath === "/api/awards/:id/embed.svg") {
      badgePatterns.push({ pattern: /^\/api\/awards\/[^/]+\/embed[.]svg$/u, badge });
    } else if (badge.sourceImagePath === "/api/awards/:id/share.png") {
      badgePatterns.push({ pattern: /^\/api\/awards\/[^/]+\/share[.]png$/u, badge });
    }
  }
  if (!Array.isArray(value.queryPolicies) || value.queryPolicies.length > 10_000) {
    fail("REDIRECT_QUERY_POLICY_SCHEMA_INVALID");
  }
  const queryPolicies = value.queryPolicies.map((item) => validateQueryPolicy(item, rulesByPath));
  const queryPoliciesByPath = new Map();
  for (const policy of queryPolicies) {
    if (queryPoliciesByPath.has(policy.sourcePath)) fail("REDIRECT_QUERY_POLICY_COLLISION");
    queryPoliciesByPath.set(policy.sourcePath, policy);
  }
  validateCoverage(value.coverage, rules, badges, queryPolicies);
  if (manifestDigest(value) !== value.manifestDigest) fail("REDIRECT_MANIFEST_DIGEST_INVALID");
  if (options.expectedDigest !== undefined && options.expectedDigest !== value.manifestDigest) {
    fail("REDIRECT_MANIFEST_PIN_MISMATCH");
  }
  if (options.requireActivatable !== false
    && (rules.some((item) => item.disposition === "review") || badges.some((item) => item.status === "review"))) {
    fail("REDIRECT_MANIFEST_UNRESOLVED_REVIEW");
  }
  return Object.freeze({
    ...value,
    rules: Object.freeze(rules),
    badges: Object.freeze(badges),
    queryPolicies: Object.freeze(queryPolicies),
    rulesByPath,
    badgesByPath,
    badgePatterns: Object.freeze(badgePatterns),
    queryPoliciesByPath,
  });
}

export async function loadLegacyRedirectManifest(input) {
  if (!HASH.test(input.expectedDigest ?? "")) fail("REDIRECT_MANIFEST_PIN_INVALID");
  if (typeof input.path !== "string" || !isAbsolute(input.path)) fail("REDIRECT_MANIFEST_PATH_INVALID");
  const path = resolve(input.path);
  const name = MANIFEST_FILE.exec(basename(path));
  if (!name || name[1] !== input.expectedDigest.slice(0, 16)) fail("REDIRECT_MANIFEST_FILENAME_INVALID");
  const stat = await lstat(path).catch(() => fail("REDIRECT_MANIFEST_NOT_FOUND"));
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > MAX_MANIFEST_BYTES) {
    fail("REDIRECT_MANIFEST_FILE_INVALID");
  }
  if (process.platform !== "win32" && (stat.mode & 0o022) !== 0) {
    fail("REDIRECT_MANIFEST_PERMISSIONS_INVALID");
  }
  const bytes = await readFile(path);
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); } catch { fail("REDIRECT_MANIFEST_JSON_INVALID"); }
  return validateLegacyRedirectManifest(parsed, {
    expectedDigest: input.expectedDigest,
    requireActivatable: true,
  });
}

function normalizedRequestPath(pathname) {
  if (typeof pathname !== "string" || pathname.length < 1 || pathname.length > 2048
    || !pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("//")
    || pathname.includes("\\") || pathname.includes("%") || /[\u0000-\u001f\u007f]/u.test(pathname)) return null;
  return pathname !== "/" && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function queryAllowed(url, policy) {
  if ([...url.searchParams.keys()].length > 64 || url.search.length > 4096) return false;
  const pageValues = url.searchParams.getAll("page");
  for (const key of url.searchParams.keys()) {
    const normalized = key.toLowerCase();
    if (TRACKING_PARAMETER.test(normalized)) continue;
    if (normalized === "page" && policy?.adapter === "legacy-pagination-consolidation-v1") continue;
    return false;
  }
  if (pageValues.length === 0) return true;
  return policy?.adapter === "legacy-pagination-consolidation-v1"
    && pageValues.length === 1 && /^[1-9][0-9]{0,5}$/u.test(pageValues[0]);
}

function firstKnown(values, allowed, fallback) {
  const first = values[0];
  return first && allowed.has(first) ? first : fallback;
}

function badgeDestination(manifest, badge, url) {
  const theme = firstKnown(url.searchParams.getAll("theme"), SPEED_BADGE_THEMES, "dark");
  const variant = firstKnown(url.searchParams.getAll("variant"), SPEED_BADGE_VARIANTS, "glow");
  const destination = new URL(badge.destinationImage, manifest.destinationOrigin);
  destination.search = new URLSearchParams({ theme, variant }).toString();
  return destination.toString();
}

function decisionKey(kind, sourcePath) {
  return `${kind}:${sha256(sourcePath).slice(0, 16)}`;
}

export function createLegacyRedirectConsumer(manifest) {
  const health = Object.freeze({
    enabled: true,
    manifestVersion: manifest.manifestVersion,
    manifestDigest: manifest.manifestDigest,
    routes: manifest.rules.length,
    images: manifest.badges.length,
  });
  return Object.freeze({
    health,
    resolve(requestTarget) {
      if (typeof requestTarget !== "string" || Buffer.byteLength(requestTarget, "utf8") > MAX_REQUEST_TARGET_BYTES) {
        return { type: "gone", status: 410, decisionKey: "gone:invalid-target" };
      }
      let url;
      try { url = new URL(requestTarget, manifest.origin); } catch {
        return { type: "gone", status: 410, decisionKey: "gone:invalid-target" };
      }
      const path = normalizedRequestPath(url.pathname);
      if (!path) return { type: "gone", status: 410, decisionKey: "gone:invalid-path" };
      if (["/health/live", "/health/ready"].includes(path)) return { type: "pass" };
      if (path === "/health/redirect-cutover") return { type: "health", status: 200, body: health };

      const badge = manifest.badgesByPath.get(path)
        ?? manifest.badgePatterns.find(({ pattern }) => pattern.test(path))?.badge;
      if (badge?.status === "gone") {
        return { type: "gone", status: 410, image: true, decisionKey: decisionKey("gone-image", path) };
      }
      if (badge) {
        const location = badge.sourceType === "badge"
          ? badgeDestination(manifest, badge, url)
          : badge.destinationImage;
        return {
          type: "redirect",
          status: 301,
          location,
          image: true,
          decisionKey: decisionKey("image", path),
        };
      }
      // No image-shaped endpoint is allowed to reach the retired HTML app.
      if (/^\/api\/(?:badge|avatar|awards)(?:\/|$)/u.test(path)) {
        return { type: "gone", status: 410, image: true, decisionKey: decisionKey("gone-image", path) };
      }

      const rule = manifest.rulesByPath.get(path);
      if (!rule || !queryAllowed(url, manifest.queryPoliciesByPath.get(path))) {
        return { type: "gone", status: 410, decisionKey: decisionKey("gone", path) };
      }
      if (rule.disposition === "gone") {
        return { type: "gone", status: 410, decisionKey: decisionKey("gone-rule", path) };
      }
      const destination = new URL(rule.destination, manifest.destinationOrigin).toString();
      return {
        type: "redirect",
        status: 301,
        location: destination,
        image: false,
        decisionKey: decisionKey("route", path),
      };
    },
  });
}

function commonHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

/** Writes a resolved cutover decision. Returns false only for explicit pass-through health checks. */
export function writeLegacyRedirectResponse(request, response, decision) {
  if (decision.type === "pass") return false;
  const head = request.method === "HEAD";
  if (decision.type === "redirect") {
    response.writeHead(301, {
      ...commonHeaders(),
      Location: decision.location,
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Length": "0",
    });
    response.end();
    return true;
  }
  if (decision.type === "health") {
    const body = Buffer.from(JSON.stringify(decision.body));
    response.writeHead(200, {
      ...commonHeaders(),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": String(body.length),
    });
    response.end(head ? undefined : body);
    return true;
  }
  const body = Buffer.from("Gone.\n");
  response.writeHead(410, {
    ...commonHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
    "Cache-Control": "public, max-age=300, s-maxage=3600",
    "Content-Length": String(body.length),
  });
  response.end(head ? undefined : body);
  return true;
}

export function cutoverLogFields(decision, manifestDigestValue) {
  return {
    code: decision.type === "redirect" ? "REDIRECT" : decision.type === "gone" ? "GONE" : "HEALTH",
    rule: typeof decision.decisionKey === "string" ? decision.decisionKey.slice(0, 40) : undefined,
    manifest: manifestDigestValue.slice(0, 16),
  };
}

/** Caps per-request decision logs and emits one redacted suppression summary per window. */
export function createBoundedCutoverLogger(log, options = {}) {
  const limit = options.limit ?? 60;
  const windowMs = options.windowMs ?? 60_000;
  const clock = options.clock ?? Date.now;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10_000
    || !Number.isSafeInteger(windowMs) || windowMs < 1_000 || windowMs > 3_600_000) {
    fail("REDIRECT_LOG_LIMIT_INVALID");
  }
  let startedAt = clock();
  let emitted = 0;
  let suppressed = 0;
  return (fields) => {
    const now = clock();
    if (now - startedAt >= windowMs) {
      if (suppressed > 0) log("redirect_cutover.logs_suppressed", { count: suppressed });
      startedAt = now;
      emitted = 0;
      suppressed = 0;
    }
    if (emitted >= limit) {
      suppressed = Math.min(Number.MAX_SAFE_INTEGER, suppressed + 1);
      return;
    }
    emitted += 1;
    log("redirect_cutover.request", fields);
  };
}
