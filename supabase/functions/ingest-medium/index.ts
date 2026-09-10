import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

const FEED_LIMIT = 2_000_000;
const ARTICLE_LIMIT = 1_000_000;
const TIMEOUT_MS = 12_000;
const MAX_ITEMS = 12;
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: true });

type RecordValue = Record<string, unknown>;
type Candidate = { externalId: string | null; url: string; title: string; author: string | null; summary: string | null; publishedAt: string | null; imageUrl: string | null };
type Source = { id: string; name: string; feed_url: string; etag: string | null; last_modified: string | null };

const asArray = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const nested = (value as RecordValue)["#text"] ?? (value as RecordValue).__cdata;
  return typeof nested === "string" || typeof nested === "number" ? String(nested).trim() : "";
};
const plain = (value: unknown): string | null => {
  const valueText = text(value);
  if (!valueText) return null;
  return valueText.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, " ").trim().slice(0, 1200) || null;
};
const isoDate = (value: unknown): string | null => {
  const timestamp = Date.parse(text(value));
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
};
const trustedMediumUrl = (value: string): URL => {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "medium.com" && !host.endsWith(".medium.com"))) throw new Error("UNTRUSTED_MEDIUM_URL");
  return url;
};
const trustedImage = (value: string): string | null => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && ["medium.com", "miro.medium.com", "cdn-images-1.medium.com"].some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ? url.toString() : null;
  } catch { return null; }
};
const canonical = (value: string): string => {
  const url = trustedMediumUrl(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || ["source", "ref", "sk"].includes(key)) url.searchParams.delete(key);
  return url.toString();
};
const hashUrl = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const imageFromMarkup = (value: unknown) => {
  const match = text(value).match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i);
  return match ? trustedImage(match[1]) : null;
};
const imageFromNode = (value: unknown): string | null => {
  for (const item of asArray(value)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as RecordValue;
    const result = trustedImage(text(record["@_url"] ?? record["@_href"]));
    if (result) return result;
  }
  return null;
};
const atomLink = (value: unknown) => asArray(value).map((item) => typeof item === "string" ? item : item && typeof item === "object" && !Array.isArray(item) && (!text((item as RecordValue)["@_rel"]) || text((item as RecordValue)["@_rel"]) === "alternate") ? text((item as RecordValue)["@_href"]) : "").find(Boolean) ?? "";

function parseFeed(xml: string): Candidate[] {
  const document = parser.parse(xml) as RecordValue;
  const channel = ((document.rss as RecordValue | undefined)?.channel ?? {}) as RecordValue;
  const rssItems = asArray(channel.item).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as RecordValue;
    const title = plain(item.title); const link = text(item.link);
    if (!title || !link) return [];
    try { return [{ externalId: text(item.guid) || null, url: canonical(link), title: title.slice(0, 500), author: plain(item.creator ?? item.author)?.slice(0, 250) ?? null, summary: plain(item.description ?? item.content ?? item.encoded), publishedAt: isoDate(item.pubDate ?? item.published ?? item.updated), imageUrl: imageFromNode(item.thumbnail) ?? imageFromNode(item.media) ?? imageFromNode(item.enclosure) ?? imageFromMarkup(item.description ?? item.content ?? item.encoded) }]; } catch { return []; }
  });
  const feed = (document.feed ?? {}) as RecordValue;
  const atomItems = asArray(feed.entry).flatMap((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as RecordValue;
    const title = plain(item.title); const link = atomLink(item.link);
    if (!title || !link) return [];
    const author = item.author && typeof item.author === "object" && !Array.isArray(item.author) ? plain((item.author as RecordValue).name) : plain(item.author);
    try { return [{ externalId: text(item.id) || null, url: canonical(link), title: title.slice(0, 500), author: author?.slice(0, 250) ?? null, summary: plain(item.summary ?? item.content), publishedAt: isoDate(item.published ?? item.updated), imageUrl: imageFromNode(item.thumbnail) ?? imageFromNode(item.media) ?? imageFromMarkup(item.summary ?? item.content) }]; } catch { return []; }
  });
  return [...rssItems, ...atomItems].filter((item) => item.publishedAt && Date.now() - Date.parse(item.publishedAt) <= 30 * 86_400_000).slice(0, MAX_ITEMS);
}

function pageMetadata(html: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  let imageUrl: string | null = null;
  for (const tag of tags) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(key ?? "")) continue;
    imageUrl = trustedImage(tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1] ?? "");
    if (imageUrl) break;
  }
  const counts = [...html.matchAll(/["'](?:clapCount|totalClapCount|totalClaps)["']\s*:\s*(\d{1,9})/gi)].map((match) => Number(match[1])).filter(Number.isSafeInteger);
  return { imageUrl, engagement: counts.length ? Math.max(...counts) : 0 };
}

async function fetchMetadata(url: string) {
  try {
    const response = await fetch(trustedMediumUrl(url), { headers: { Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok || Number(response.headers.get("content-length") ?? 0) > ARTICLE_LIMIT) return { imageUrl: null, engagement: 0 };
    trustedMediumUrl(response.url);
    const html = await response.text();
    return new TextEncoder().encode(html).byteLength <= ARTICLE_LIMIT ? pageMetadata(html) : { imageUrl: null, engagement: 0 };
  } catch { return { imageUrl: null, engagement: 0 }; }
}

const topicRules: Record<string, string[]> = {
  "Artificial Intelligence": ["artificial intelligence", "machine learning", " llm", "generative ai", "neural"],
  "Programming": ["programming", "javascript", "typescript", "python", "rust", "java", "golang"],
  "Software Engineering": ["software engineering", "architecture", "testing", "api", "database", "system design"],
  "Cybersecurity": ["security", "cyber", "vulnerability", "malware", "zero trust"],
  "Startups": ["startup", "founder", "venture", "funding", "product market"],
  "Cloud Computing": ["cloud", "aws", "azure", "kubernetes", "serverless", "devops"],
  "Data Science": ["data science", "analytics", "data engineering", "statistics"],
  "Developer Tools": ["developer tool", "ide", "sdk", "cli", "github", "open source"],
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL");
  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS");
  const key = secretKeys ? (JSON.parse(secretKeys) as Record<string, string>).default : undefined;
  if (!url || !key) return Response.json({ error: "Service configuration unavailable" }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const suppliedSecret = request.headers.get("x-cron-secret") ?? "";
  const { data: authorized, error: authError } = await supabase.rpc("verify_ingestion_cron_secret", { candidate: suppliedSecret });
  if (authError || authorized !== true) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [{ data: sources, error: sourceError }, { data: interests, error: interestError }] = await Promise.all([
    supabase.from("sources").select("id,name,feed_url,etag,last_modified").eq("is_active", true).eq("source_type", "medium_rss").limit(20),
    supabase.from("interests").select("id,name"),
  ]);
  if (sourceError || interestError) return Response.json({ error: "Configuration unavailable" }, { status: 502 });
  const interestByName = new Map((interests ?? []).map((item) => [item.name, item.id]));
  const results = [];
  for (const source of (sources ?? []) as Source[]) {
    const { data: run } = await supabase.from("ingestion_runs").insert({ source_id: source.id, status: "running" }).select("id").single();
    let inserted = 0; let duplicates = 0; let fetched = 0;
    try {
      const headers = new Headers({ Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" });
      if (source.etag) headers.set("If-None-Match", source.etag); if (source.last_modified) headers.set("If-Modified-Since", source.last_modified);
      const response = await fetch(trustedMediumUrl(source.feed_url), { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status === 304) { await supabase.from("sources").update({ last_successful_fetch: new Date().toISOString(), last_error_code: null }).eq("id", source.id); if (run) await supabase.from("ingestion_runs").update({ status: "succeeded", finished_at: new Date().toISOString() }).eq("id", run.id); results.push({ sourceId: source.id, fetched: 0, inserted: 0 }); continue; }
      if (!response.ok || Number(response.headers.get("content-length") ?? 0) > FEED_LIMIT) throw new Error(`HTTP_${response.status}`);
      const xml = await response.text(); if (new TextEncoder().encode(xml).byteLength > FEED_LIMIT) throw new Error("FEED_TOO_LARGE");
      const candidates = parseFeed(xml); fetched = candidates.length;
      const enriched = await Promise.all(candidates.map(async (item) => ({ item, metadata: await fetchMetadata(item.url) })));
      enriched.sort((a, b) => b.metadata.engagement - a.metadata.engagement || Date.parse(b.item.publishedAt ?? "") - Date.parse(a.item.publishedAt ?? ""));
      for (const { item, metadata } of enriched) {
        const urlHash = await hashUrl(item.url); const imageUrl = item.imageUrl ?? metadata.imageUrl;
        const { data: existing } = await supabase.from("content_items").select("id,engagement_count").eq("url_hash", urlHash).maybeSingle();
        let itemId = existing?.id;
        if (itemId) { duplicates += 1; await supabase.from("content_items").update({ ...(imageUrl ? { image_url: imageUrl } : {}), engagement_count: Math.max(existing.engagement_count ?? 0, metadata.engagement), engagement_checked_at: new Date().toISOString() }).eq("id", itemId); }
        else {
          const { data: created, error } = await supabase.from("content_items").insert({ primary_source_id: source.id, external_id: item.externalId, canonical_url: item.url, url_hash: urlHash, title: item.title, author: item.author, summary: item.summary, image_url: imageUrl, engagement_count: metadata.engagement, engagement_checked_at: new Date().toISOString(), published_at: item.publishedAt, publication_time_status: "known" }).select("id").single();
          if (error?.code === "23505" && item.externalId) {
            const { data: duplicate } = await supabase.from("content_items").select("id").eq("primary_source_id", source.id).eq("external_id", item.externalId).maybeSingle();
            itemId = duplicate?.id;
            duplicates += 1;
          } else if (error) throw new Error("ITEM_INSERT_FAILED");
          else { itemId = created.id; inserted += 1; }
        }
        if (!itemId) throw new Error("ITEM_ID_MISSING");
        await supabase.from("content_item_sources").upsert({ content_item_id: itemId, source_id: source.id }, { onConflict: "content_item_id,source_id", ignoreDuplicates: true });
        const haystack = `${item.title} ${item.summary ?? ""} ${source.name}`.toLowerCase();
        const links = Object.entries(topicRules).flatMap(([name, words]) => words.some((word) => haystack.includes(word)) && interestByName.has(name) ? [{ content_item_id: itemId, interest_id: interestByName.get(name), confidence: 0.8 }] : []);
        if (links.length) await supabase.from("content_item_interests").upsert(links, { onConflict: "content_item_id,interest_id" });
      }
      const finished = new Date().toISOString(); await Promise.all([supabase.from("sources").update({ etag: response.headers.get("etag"), last_modified: response.headers.get("last-modified"), last_successful_fetch: finished, last_error_code: null }).eq("id", source.id), run ? supabase.from("ingestion_runs").update({ status: "succeeded", finished_at: finished, fetched_count: fetched, inserted_count: inserted, duplicate_count: duplicates }).eq("id", run.id) : Promise.resolve()]);
      results.push({ sourceId: source.id, fetched, inserted, duplicates });
    } catch (error) { const code = error instanceof Error && /^[A-Z0-9_:-]+$/.test(error.message) ? error.message : "INGESTION_FAILED"; await supabase.from("sources").update({ last_error_code: code }).eq("id", source.id); if (run) await supabase.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), error_code: code }).eq("id", run.id); results.push({ sourceId: source.id, error: code }); }
  }
  return Response.json({ processed: results.length, results });
});
