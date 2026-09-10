import { XMLParser } from "fast-xml-parser";
import { isPublicHttpHost } from "@/lib/ingestion/network";
import { canonicalizeUrl } from "@/lib/url";

export const MAX_BODY_TEXT_CHARS = 20_000;

export interface RssCandidate {
  externalId: string | null;
  canonicalUrl: string;
  title: string;
  author: string | null;
  summary: string | null;
  bodyText: string | null;
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

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  hellip: "…", mdash: "—", ndash: "–", middot: "·", trade: "™",
};

/**
 * Decodes both named and numeric HTML entities.
 *
 * Feed descriptions arrive inside CDATA, where the XML parser leaves entities
 * alone, so anything not decoded here reaches the reader verbatim. Titles are
 * decoded by the parser, which is why only summaries and bodies were affected.
 *
 * Numeric entities are the important half and were previously not handled at
 * all: 94 of 298 stored rows carried them, and a Russian summary was 111
 * entities long. Beyond looking like gibberish, entity-encoded text is pure
 * ASCII, which hides non-Latin script from the language check and inflates the
 * word count the substance score reads.
 *
 * Applied repeatedly because feeds double-encode: "&amp;#x2019;" needs one pass
 * to become "&#x2019;" and another to become the character itself.
 */
export function decodeEntities(value: string): string {
  let current = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = current
      .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
      .replace(/&#x([0-9a-f]+);/gi, (match, hex: string) => codePoint(parseInt(hex, 16)) ?? match)
      .replace(/&#(\d+);/g, (match, dec: string) => codePoint(Number(dec)) ?? match);
    if (next === current) break;
    current = next;
  }
  return current;
}

/** Guards against malformed entities naming a code point that does not exist. */
function codePoint(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0 || value > 0x10ffff) return null;
  // Lone surrogates are not encodable and would corrupt the string.
  if (value >= 0xd800 && value <= 0xdfff) return null;
  try {
    return String.fromCodePoint(value);
  } catch {
    return null;
  }
}

function plainText(value: XmlValue, limit = 1200): string | null {
  const raw = text(value);
  if (!raw) return null;
  // Tags are stripped before decoding, so a decoded "<" stays literal text
  // rather than becoming markup.
  const decoded = decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return decoded ? decoded.slice(0, limit) : null;
}

/**
 * Markup or Markdown to readable text, for the discovery adapters whose APIs
 * return a body rather than a page to extract. Shares `decodeEntities` with the
 * feed parser so an entity decodes the same way whichever path carried it.
 *
 * Tags are stripped before decoding, so a decoded "<" stays literal text rather
 * than becoming markup -- the same order `plainText` uses above.
 */
export function stripMarkup(raw: string | null | undefined, limit = MAX_BODY_TEXT_CHARS): string | null {
  if (!raw) return null;
  const decoded = decodeEntities(
    raw
      // Fenced code blocks and images carry no prose. Dropped before the tag
      // strip so a release note is measured on what it says, not on its diff.
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
  return decoded ? decoded.slice(0, limit) : null;
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

const MEDIUM_IMAGE_HOSTS = ["cdn-images-1.medium.com", "miro.medium.com", "medium.com"];
const MAX_IMAGE_URL_CHARS = 2048;

/** Medium's adapter only trusts Medium-hosted images. */
export function mediumImageUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !MEDIUM_IMAGE_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return null;
    const resolved = url.toString();
    // This path does not go through safeImageUrl, so it needs the same guard:
    // the generated stand-in lives on exactly these hosts.
    return isPlaceholderImageUrl(resolved) ? null : resolved;
  } catch {
    return null;
  }
}

/**
 * Any publisher image, as long as it is HTTPS, on a public host, and free of
 * credentials. Relative sources are resolved against the item's own link.
 */
/**
 * Images that are not pictures of anything.
 *
 * Medium serves a generated placeholder for posts with no image of their own,
 * at `miro.medium.com/v2/da:true/<hash>`. Measured on 2026-09-10: 35 of 431
 * stored images used it, and three sampled at random came back byte-identical
 * -- 17,893 bytes, 1200x630 -- so it is one file standing in for "no image",
 * not artwork that happens to be plain.
 *
 * A card with no image is already a supported, honest state. A card carrying a
 * meaningless smudge is worse than one carrying nothing.
 */
const PLACEHOLDER_IMAGE_PATTERNS = [
  // Medium's generated stand-in.
  /\/da:true\//,
  // Tracking pixels and spacers, which are images only in the technical sense.
  /(?:^|\/)(?:1x1|pixel|spacer|blank)\.(?:gif|png|jpg)(?:$|\?)/i,
  /\/stat\?event=/i,
];

export function isPlaceholderImageUrl(value: string): boolean {
  if (PLACEHOLDER_IMAGE_PATTERNS.some((pattern) => pattern.test(value))) return true;
  // Anything this small is an avatar or an icon, never a story image.
  const sized = value.match(/resize:(?:fit|fill):(\d+)/);
  return sized ? Number(sized[1]) < 200 : false;
}

export function safeImageUrl(value: string, baseUrl?: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > MAX_IMAGE_URL_CHARS) return null;
  try {
    const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (!isPublicHttpHost(url.hostname)) return null;
    const resolved = url.toString();
    if (resolved.length > MAX_IMAGE_URL_CHARS) return null;
    // Checked after resolution so a relative placeholder is caught too.
    return isPlaceholderImageUrl(resolved) ? null : resolved;
  } catch {
    return null;
  }
}

function imageUrlFromMarkup(value: XmlValue, base?: string): string | null {
  const raw = text(value);
  const match = raw.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return match ? safeImageUrl(match[1], base) : null;
}

function imageUrlFromNodes(value: unknown, base?: string): string | null {
  for (const node of asArray(value)) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const record = node as Record<string, unknown>;
    const type = text(record["@_type"] as XmlValue).toLowerCase();
    if (type && !type.startsWith("image/")) continue;
    const url = safeImageUrl(text((record["@_url"] ?? record["@_href"]) as XmlValue), base);
    if (url) return url;
  }
  return null;
}

function rssImageUrl(item: Record<string, unknown>, base?: string): string | null {
  return imageUrlFromNodes(item.thumbnail, base)
    ?? imageUrlFromNodes(item.media, base)
    ?? imageUrlFromNodes(item.enclosure, base)
    ?? imageUrlFromMarkup((item.description ?? item.content ?? item.encoded) as XmlValue, base);
}

function atomImageUrl(entry: Record<string, unknown>, base?: string): string | null {
  const enclosureUrl = asArray(entry.link).flatMap((node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return [];
    const record = node as Record<string, unknown>;
    const relation = text(record["@_rel"] as XmlValue);
    const type = text(record["@_type"] as XmlValue);
    if (relation !== "enclosure" && !type.startsWith("image/")) return [];
    const url = safeImageUrl(text(record["@_href"] as XmlValue), base);
    return url ? [url] : [];
  })[0];
  return imageUrlFromNodes(entry.thumbnail, base)
    ?? imageUrlFromNodes(entry.media, base)
    ?? enclosureUrl
    ?? imageUrlFromMarkup((entry.summary ?? entry.content) as XmlValue, base);
}

function candidateFromRss(item: Record<string, unknown>): RssCandidate | null {
  const link = text(item.link as XmlValue);
  const title = plainText(item.title as XmlValue);
  if (!link || !title) return null;
  try {
    const canonicalUrl = canonicalizeUrl(link);
    return {
      externalId: text(item.guid as XmlValue) || null,
      canonicalUrl,
      title: title.slice(0, 500),
      author: plainText((item.creator ?? item.author) as XmlValue)?.slice(0, 250) ?? null,
      summary: plainText((item.description ?? item.content ?? item.encoded) as XmlValue),
      bodyText: plainText((item.encoded ?? item.content) as XmlValue, MAX_BODY_TEXT_CHARS),
      publishedAt: isoDate((item.pubDate ?? item.published ?? item.updated) as XmlValue),
      imageUrl: rssImageUrl(item, canonicalUrl),
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
    const canonicalUrl = canonicalizeUrl(link);
    return {
      externalId: text(entry.id as XmlValue) || null,
      canonicalUrl,
      title: title.slice(0, 500),
      author: author?.slice(0, 250) ?? null,
      summary: plainText((entry.summary ?? entry.content) as XmlValue),
      bodyText: plainText(entry.content as XmlValue, MAX_BODY_TEXT_CHARS),
      publishedAt: isoDate((entry.published ?? entry.updated) as XmlValue),
      imageUrl: atomImageUrl(entry, canonicalUrl),
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
