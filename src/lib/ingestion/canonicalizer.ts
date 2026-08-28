import crypto from "crypto";

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "ref",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "si",
  "s",
]);

/**
 * Strips tracking parameters and normalizes a canonical URL.
 */
export function normalizeCanonicalUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    url.hash = ""; // Remove fragment

    // Filter out tracking query params
    const searchParams = new URLSearchParams(url.search);
    Array.from(searchParams.keys()).forEach((key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        searchParams.delete(key);
      }
    });

    url.search = searchParams.toString();

    // Remove trailing slash for uniformity unless root path
    let href = url.toString();
    if (href.endsWith("/") && url.pathname !== "/") {
      href = href.slice(0, -1);
    }

    return href;
  } catch {
    return urlStr.trim();
  }
}

/**
 * Generates a SHA-256 hash of a normalized canonical URL for primary deduplication.
 */
export function generateUrlHash(urlStr: string): string {
  const normalized = normalizeCanonicalUrl(urlStr);
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
