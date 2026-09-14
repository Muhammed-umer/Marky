import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { MAX_BODY_TEXT_CHARS, safeImageUrl } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * The DOM behind Readability is linkedom, pinned to 0.16.x, not jsdom.
 *
 * The Vercel runtime (Node 22.23 on 2026-09-14) runs functions with
 * require(esm) disabled, and every jsdom line from 27 up pulls in a CommonJS
 * dependency that `require()`s an ES module (`html-encoding-sniffer` 6,
 * `@asamuzakjp/css-color`), so importing jsdom threw ERR_REQUIRE_ESM and every
 * route that extracts a page answered an empty 500 -- including link
 * submission. linkedom 0.16 depends only on CommonJS packages; 0.18 does not
 * (css-select 7 is ESM-only), which is why the version is exact. Verify a
 * dependency change with `node --no-experimental-require-module -e
 * "require('linkedom')"`, which reproduces the host exactly.
 *
 * Readability resolves relative links against `document.baseURI`, which
 * linkedom leaves undefined; it falls back to the raw value, and the fields
 * this module returns are resolved against the requested URL here anyway.
 */

export interface WebMetadata {
  canonicalUrl: string;
  title: string;
  author: string | null;
  summary: string | null;
  bodyText: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
}

const ARTICLE_TYPES = new Set(["Article", "NewsArticle", "BlogPosting", "TechArticle", "Report"]);

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

interface JsonLdArticle {
  image: string | null;
  author: string | null;
  publishedAt: string | null;
}

function nodeType(node: Record<string, unknown>): string[] {
  const type = node["@type"];
  if (typeof type === "string") return [type];
  return Array.isArray(type) ? type.filter((entry): entry is string => typeof entry === "string") : [];
}

/** JSON-LD `image` is a URL, an ImageObject, or an array of either. */
function jsonLdImage(value: unknown): string | null {
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string") return url;
    }
  }
  return null;
}

function jsonLdAuthor(value: unknown): string | null {
  for (const entry of Array.isArray(value) ? value : [value]) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const name = (entry as Record<string, unknown>).name;
      if (typeof name === "string") return name;
    }
  }
  return null;
}

function collectNodes(value: unknown, into: Record<string, unknown>[]) {
  if (Array.isArray(value)) {
    for (const entry of value) collectNodes(entry, into);
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  into.push(node);
  if (node["@graph"]) collectNodes(node["@graph"], into);
}

function parseJsonLd(document: Document): JsonLdArticle {
  const empty: JsonLdArticle = { image: null, author: null, publishedAt: null };
  const nodes: Record<string, unknown>[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = script.textContent?.trim();
    if (!raw) continue;
    try {
      collectNodes(JSON.parse(raw), nodes);
    } catch {
      // A malformed block is data, not a failure: skip it and keep looking.
    }
  }
  const article = nodes.find((node) => nodeType(node).some((type) => ARTICLE_TYPES.has(type)));
  if (!article) return empty;
  return {
    image: jsonLdImage(article.image),
    author: cleanText(jsonLdAuthor(article.author), 250),
    publishedAt: validDate(
      typeof article.datePublished === "string" ? article.datePublished
        : typeof article.dateCreated === "string" ? article.dateCreated
          : null,
    ),
  };
}

export function parseWebMetadata(html: string, requestedUrl: string): WebMetadata {
  const document = parseHTML(html).document as unknown as Document;
  const readable = new Readability(document.cloneNode(true) as Document).parse();
  const jsonLd = parseJsonLd(document);
  const canonicalHref = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let canonicalUrl = requestedUrl;
  if (canonicalHref) {
    try { canonicalUrl = new URL(canonicalHref, requestedUrl).toString(); } catch { /* use requested URL */ }
  }
  const host = new URL(requestedUrl).hostname.replace(/^www\./, "");

  // Open Graph beats JSON-LD for images (publishers maintain og:image more
  // carefully); JSON-LD beats meta tags for dates and authors.
  const imageCandidates = [
    meta(document, "og:image", "og:image:url"),
    jsonLd.image,
    meta(document, "twitter:image", "twitter:image:src"),
    document.querySelector('link[rel="image_src"]')?.getAttribute("href") ?? null,
  ];
  const imageUrl = imageCandidates.reduce<string | null>(
    (found, candidate) => found ?? (candidate ? safeImageUrl(candidate, requestedUrl) : null),
    null,
  );

  return {
    canonicalUrl: canonicalizeUrl(canonicalUrl),
    title: cleanText(meta(document, "og:title", "twitter:title") ?? readable?.title ?? document.title, 500) ?? host,
    author: cleanText(jsonLd.author ?? meta(document, "author", "article:author", "byl") ?? readable?.byline, 250),
    summary: cleanText(meta(document, "description", "og:description", "twitter:description") ?? readable?.excerpt ?? readable?.textContent, 1_200),
    bodyText: cleanText(readable?.textContent, MAX_BODY_TEXT_CHARS),
    imageUrl,
    publishedAt: jsonLd.publishedAt ?? validDate(meta(document, "article:published_time", "datePublished", "date", "pubdate")),
  };
}
