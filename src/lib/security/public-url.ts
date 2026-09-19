import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";

export class UnsafeUrlError extends Error {
  readonly code = "TFW-SEC-001";

  constructor(message = "Only public HTTP and HTTPS websites are allowed.") {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export type PublicAddress = { address: string; family: 4 | 6 };
export type AddressResolver = (hostname: string) => Promise<PublicAddress[]>;

const INTERNAL_SUFFIXES = [
  "localhost", "local", "internal", "lan", "home", "home.arpa", "corp",
  "intranet", "invalid", "test", "example", "onion", "arpa",
];
const TRACKING_PARAMETERS = new Set([
  "fbclid", "gclid", "dclid", "msclkid", "gbraid", "wbraid", "mc_cid", "mc_eid",
]);

function withoutBrackets(hostname: string): string {
  return hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
}

/** Fail closed for special-use ranges, including IPv4-mapped/NAT64 addresses. */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address) || address.includes("%")) return false;
  const parsed = ipaddr.parse(address);
  if (parsed.range() !== "unicast") return false;
  if (parsed.kind() === "ipv4") {
    // Azure's virtual host platform endpoint uses an otherwise public address.
    return parsed.toString() !== "168.63.129.16";
  }
  const ipv6 = parsed as ipaddr.IPv6;
  // Only currently allocated global unicast. Exclude IETF protocol assignments
  // and the newer documentation block explicitly as well as ipaddr's ranges.
  return ipv6.match(ipaddr.parseCIDR("2000::/3")) &&
    !ipv6.match(ipaddr.parseCIDR("2001::/23")) &&
    !ipv6.match(ipaddr.parseCIDR("3fff::/20"));
}

/** Syntax/policy validation only; use resolvePublicTarget before opening sockets. */
export function parsePublicHttpUrl(input: string): URL {
  const value = input.trim();
  if (!value || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) {
    throw new UnsafeUrlError();
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(value);
  let url: URL;
  try {
    url = new URL(hasScheme ? value : `https://${value}`);
  } catch {
    throw new UnsafeUrlError();
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    throw new UnsafeUrlError();
  }
  url.hostname = url.hostname.replace(/\.$/, "");
  url.hash = "";
  const hostname = withoutBrackets(url.hostname);
  if (ipaddr.isValid(hostname)) {
    if (!isPublicAddress(hostname)) throw new UnsafeUrlError();
  } else {
    if (!hostname.includes(".") || hostname.length > 253 ||
        hostname.split(".").some((label) => !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ||
        INTERNAL_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`))) {
      throw new UnsafeUrlError();
    }
  }
  return url;
}

/** Preserve protocol, www and path: equivalence needs a verified redirect. */
export function normalizePublicUrl(input: string): string {
  const url = parsePublicHttpUrl(input);
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export const systemAddressResolver: AddressResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
};

export async function resolvePublicTarget(
  input: string | URL,
  resolver: AddressResolver = systemAddressResolver,
): Promise<{ url: URL; address: PublicAddress }> {
  const url = parsePublicHttpUrl(String(input));
  const hostname = withoutBrackets(url.hostname);
  const addresses: PublicAddress[] = ipaddr.isValid(hostname)
    ? [{ address: hostname, family: ipaddr.parse(hostname).kind() === "ipv4" ? 4 : 6 }]
    : await resolver(hostname);
  // Reject mixed public/private DNS answers, not just the selected answer.
  if (!addresses.length || addresses.some((record) =>
    !isPublicAddress(record.address) || ![4, 6].includes(record.family) ||
    (ipaddr.parse(record.address).kind() === "ipv4" ? 4 : 6) !== record.family)) {
    throw new UnsafeUrlError();
  }
  return { url, address: { ...addresses[0], address: ipaddr.parse(addresses[0].address).toString() } };
}
