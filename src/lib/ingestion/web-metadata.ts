import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { canonicalizeUrl } from "@/lib/url";

export interface WebMetadata {
  canonicalUrl: string;
  title: string;
  author: string | null;
  summary: string | null;
  publishedAt: string | null;
}

function cleanText(value: string | null | undefined, limit: number) {
  const text = value?.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : null;
}

function meta(document: Document, ...keys: string[]) {
  for (const key of keys) {
    const node = document.querySelector(`meta[property="${key}"], meta[name="${key}"]`);
    const value = cleanText(node?.getAttribute("content"), 2_000);
    if (value) return value;
  }
  return null;
}

function validDate(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

export function parseWebMetadata(html: string, requestedUrl: string): WebMetadata {
  const dom = new JSDOM(html, { url: requestedUrl });
  const document = dom.window.document;
  const readable = new Readability(document.cloneNode(true) as Document).parse();
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let canonicalUrl = requestedUrl;
  if (canonicalHref) {
    try { canonicalUrl = new URL(canonicalHref, requestedUrl).toString(); } catch { /* use requested URL */ }
  }
  const host = new URL(requestedUrl).hostname.replace(/^www\./, "");
  return {
    canonicalUrl: canonicalizeUrl(canonicalUrl),
    title: cleanText(meta(document, "og:title", "twitter:title") ?? readable?.title ?? document.title, 500) ?? host,
    author: cleanText(meta(document, "author", "article:author", "byl") ?? readable?.byline, 250),
    summary: cleanText(meta(document, "description", "og:description", "twitter:description") ?? readable?.excerpt ?? readable?.textContent, 1_200),
    publishedAt: validDate(meta(document, "article:published_time", "datePublished", "date", "pubdate")),
  };
}
