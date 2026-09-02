import { XMLParser } from "fast-xml-parser";
import { canonicalizeUrl } from "@/lib/url";

export interface RssCandidate {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  summary: string | null;
  publishedAt: string | null;
  imageUrl: string | null;
}

type XmlValue = string | number | Record<string, unknown> | Array<unknown> | null | undefined;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function text(value: XmlValue): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || Array.isArray(value)) return "";
  const nested = value["#text"] ?? value.__cdata;
  return typeof nested === "string" || typeof nested === "number" ? String(nested).trim() : "";
}

function plainText(value: XmlValue): string | null {
  const raw = text(value);
  if (!raw) return null;
  const decoded = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return decoded ? decoded.slice(0, 1200) : null;
}

function isoDate(value: XmlValue): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function atomLink(value: unknown): string {
  for (const entry of asArray(value)) {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const relation = text(record["@_rel"] as XmlValue) || "alternate";
    const href = text(record["@_href"] as XmlValue);
    if (relation === "alternate" && href) return href;
  }
  return "";
}

export function trustedImageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !["cdn-images-1.medium.com", "miro.medium.com", "medium.com"].some((host) => hostname === host || hostname.endsWith(`.${host}`))) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function imageUrlFromMarkup(value: XmlValue): string | null {
  const raw = text(value);
  const match = raw.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return match ? trustedImageUrl(match[1]) : null;
}

function imageUrlFromNodes(value: unknown): string | null {
  for (const node of asArray(value)) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    const url = trustedImageUrl(text((record["@_url"] ?? record["@_href"]) as XmlValue));
    if (url) return url;
  }
  return null;
}

function rssImageUrl(item: Record<string, unknown>): string | null {
  return imageUrlFromNodes(item.thumbnail)
    ?? imageUrlFromNodes(item.media)
    ?? imageUrlFromNodes(item.enclosure)
    ?? imageUrlFromMarkup((item.description ?? item.content ?? item.encoded) as XmlValue);
}

function atomImageUrl(entry: Record<string, unknown>): string | null {
  const enclosureUrl = asArray(entry.link).flatMap((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    const record = node as Record<string, unknown>;
    const relation = text(record["@_rel"] as XmlValue);
    const type = text(record["@_type"] as XmlValue);
    if (relation !== "enclosure" && !type.startsWith("image/")) return [];
    const url = trustedImageUrl(text(record["@_href"] as XmlValue));
    return url ? [url] : [];
  })[0];
  return imageUrlFromNodes(entry.thumbnail)
    ?? imageUrlFromNodes(entry.media)
    ?? enclosureUrl
    ?? imageUrlFromMarkup((entry.summary ?? entry.content) as XmlValue);
}

function candidateFromRss(item: Record<string, unknown>): RssCandidate | null {
  const link = text(item.link as XmlValue);
  const title = plainText(item.title as XmlValue);
  if (!link || !title) return null;
  try {
    return {
      externalId: text(item.guid as XmlValue) || null,
      canonicalUrl: canonicalizeUrl(link),
      title: title.slice(0, 500),
      author: plainText((item.creator ?? item.author) as XmlValue)?.slice(0, 250) ?? null,
      summary: plainText((item.description ?? item.content ?? item.encoded) as XmlValue),
      publishedAt: isoDate((item.pubDate ?? item.published ?? item.updated) as XmlValue),
      imageUrl: rssImageUrl(item),
    };
  } catch {
    return null;
  }
}

function candidateFromAtom(entry: Record<string, unknown>): RssCandidate | null {
  const link = atomLink(entry.link);
  const title = plainText(entry.title as XmlValue);
  if (!link || !title) return null;
  const authorValue = entry.author;
  const author = authorValue && typeof authorValue === "object" && !Array.isArray(authorValue)
    ? plainText((authorValue as Record<string, unknown>).name as XmlValue)
    : plainText(authorValue as XmlValue);
  try {
    return {
      externalId: text(entry.id as XmlValue) || null,
      canonicalUrl: canonicalizeUrl(link),
      title: title.slice(0, 500),
      author: author?.slice(0, 250) ?? null,
      summary: plainText((entry.summary ?? entry.content) as XmlValue),
      publishedAt: isoDate((entry.published ?? entry.updated) as XmlValue),
      imageUrl: atomImageUrl(entry),
    };
  } catch {
    return null;
  }
}

export function parseRssFeed(xml: string): RssCandidate[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const rss = document.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = asArray(channel?.item).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const candidate = candidateFromRss(item as Record<string, unknown>);
    return candidate ? [candidate] : [];
  });

  const feed = document.feed as Record<string, unknown> | undefined;
  const atomItems = asArray(feed?.entry).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = candidateFromAtom(entry as Record<string, unknown>);
    return candidate ? [candidate] : [];
  });

  return [...rssItems, ...atomItems].slice(0, 50);
}
