import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc")
    || normalized.startsWith("fd") || /^fe[89ab]/.test(normalized);
}

/**
 * Synchronous host check for URLs that are stored and later loaded by the
 * browser (image sources) rather than fetched by the server. It cannot resolve
 * DNS, so it only rejects literal private addresses and local hostnames.
 * Server-side fetches must still go through assertPublicHttpUrl.
 */
export function isPublicHttpHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  const version = isIP(host);
  if (!version) return true;
  return version === 4 ? !isPrivateIpv4(host) : !isPrivateIpv6(host);
}

export async function assertPublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol) || url.username || url.password || url.port) throw new Error("UNSAFE_SOURCE_URL");
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local")) throw new Error("UNSAFE_SOURCE_HOST");
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isIP(address) === 4 ? isPrivateIpv4(address) : isPrivateIpv6(address))) {
    throw new Error("UNSAFE_SOURCE_HOST");
  }
  return url;
}

/**
 * Identifies Marky on every outbound page fetch.
 *
 * Sending no User-Agent gets a bare 403 from Medium and several other
 * publishers, which silently emptied extraction: the page fetch failed, the
 * feed's teaser stood, and nothing recorded why. A plain "Marky/1.0" is
 * refused too.
 *
 * The "Mozilla/5.0 (compatible; <name>; +<url>)" shape is the long-standing
 * convention for well-behaved crawlers -- it is what Googlebot and Bingbot
 * send -- and it identifies Marky with a contact URL rather than
 * impersonating a browser.
 */
export const MARKY_USER_AGENT = "Mozilla/5.0 (compatible; MarkyBot/1.0; +https://marky.app/bot)";
