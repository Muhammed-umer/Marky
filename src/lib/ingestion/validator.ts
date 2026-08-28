import { RawContentItem } from "./types";
import { normalizeCanonicalUrl } from "./canonicalizer";

/**
 * Sanitizes untrusted HTML content to remove script tags and malicious attributes (XSS protection).
 */
export function sanitizeHtml(rawHtml: string | null): string | null {
  if (!rawHtml) return null;

  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\s*on\w+=\s*["'][^"']*["']/gi, "")
    .replace(/\s*on\w+=\s*[^>\s]+/gi, "")
    .replace(/href=\s*["']javascript:[^"']*["']/gi, 'href="#"');
}

/**
 * Validates a raw content item schema according to Marky safety rules:
 * - Must have non-empty title and valid canonical URL.
 * - Sanitizes body content and summary.
 * - Does NOT fabricate missing metadata.
 */
export function validateContentItem(item: RawContentItem): {
  valid: boolean;
  sanitizedItem?: RawContentItem;
  reason?: string;
} {
  if (!item.title || item.title.trim().length === 0) {
    return { valid: false, reason: "Title is missing or empty" };
  }

  if (!item.canonical_url || item.canonical_url.trim().length === 0) {
    return { valid: false, reason: "Canonical URL is missing or empty" };
  }

  const normalizedUrl = normalizeCanonicalUrl(item.canonical_url);

  const sanitizedItem: RawContentItem = {
    title: item.title.trim(),
    canonical_url: normalizedUrl,
    summary: item.summary ? sanitizeHtml(item.summary.trim()) : null,
    body_content: item.body_content ? sanitizeHtml(item.body_content.trim()) : null,
    author: item.author?.trim() || "Unknown Author",
    published_at: item.published_at || null, // No fabricated timestamps
  };

  return {
    valid: true,
    sanitizedItem,
  };
}
