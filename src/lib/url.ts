import { createHash } from "node:crypto";

const TRACKING_KEYS = new Set(["ref", "fbclid", "gclid"]);

/**
 * Medium stamps the discovering feed into its RSS item links as
 * `?source=rss----<feed id>---4`, so the same post found under two tag feeds
 * would hash twice and store twice.
 *
 * Matched on the `rss` value rather than the bare `source` key on purpose:
 * other publishers use `?source=` to mean something real, and widening this
 * would change url_hash for URLs already stored.
 */
function isFeedTrackingParam(key: string, value: string) {
  return key.toLowerCase() === "source" && value.toLowerCase().startsWith("rss");
}

export function canonicalizeUrl(value: string): string {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("Only HTTP and HTTPS links are supported.");
  if (url.username || url.password) throw new Error("Links with embedded credentials are not allowed.");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) {
    const isTracking = key.toLowerCase().startsWith("utm_")
      || TRACKING_KEYS.has(key.toLowerCase())
      || isFeedTrackingParam(key, url.searchParams.get(key) ?? "");
    if (isTracking) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

export function urlHash(url: string): string {
  return createHash("sha256").update(canonicalizeUrl(url)).digest("hex");
}
