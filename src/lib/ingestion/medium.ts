import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { parseRssFeed, trustedImageUrl } from "@/lib/ingestion/rss";
import { urlHash } from "@/lib/url";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";

const MAX_FEED_BYTES = 2_000_000;
const MAX_ARTICLE_BYTES = 1_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_AGE_DAYS = 30;
const MAX_CANDIDATES_PER_SOURCE = 12;

export type MediumSource = IngestionSource;

function errorCode(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message)) return error.message;
  return "INGESTION_FAILED";
}

function validateMediumFeedUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (hostname !== "medium.com" && !hostname.endsWith(".medium.com"))) {
    throw new Error("UNTRUSTED_FEED_HOST");
  }
  return url;
}

function validateMediumArticleUrl(value: string): URL {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (hostname !== "medium.com" && !hostname.endsWith(".medium.com"))) {
    throw new Error("UNTRUSTED_ARTICLE_HOST");
  }
  return url;
}

function htmlAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? null;
}

export function imageUrlFromHtml(html: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const property = htmlAttribute(tag, "property")?.toLowerCase();
    const name = htmlAttribute(tag, "name")?.toLowerCase();
    if (!["og:image", "og:image:url", "twitter:image", "twitter:image:src"].includes(property ?? name ?? "")) continue;
    const imageUrl = trustedImageUrl(htmlAttribute(tag, "content") ?? "");
    if (imageUrl) return imageUrl;
  }

  const imageLinks = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of imageLinks) {
    const relation = htmlAttribute(tag, "rel")?.toLowerCase();
    if (relation !== "image_src") continue;
    const imageUrl = trustedImageUrl(htmlAttribute(tag, "href") ?? "");
    if (imageUrl) return imageUrl;
  }

  return null;
}

export function engagementCountFromHtml(html: string): number {
  const counts: number[] = [];
  const patterns = [
    /["'](?:clapCount|totalClapCount|totalClaps)["']\s*:\s*(\d{1,9})/gi,
    /(?:clapCount|totalClapCount|totalClaps)\\?"\s*:\s*(\d{1,9})/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const count = Number(match[1]);
      if (Number.isSafeInteger(count) && count >= 0) counts.push(count);
    }
  }
  return counts.length ? Math.max(...counts) : 0;
}

interface ArticleMetadata { imageUrl: string | null }

async function fetchArticleMetadata(canonicalUrl: string): Promise<ArticleMetadata> {
  try {
    const url = validateMediumArticleUrl(canonicalUrl);
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.url) validateMediumArticleUrl(response.url);
    if (!response.ok) return { imageUrl: null };
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_ARTICLE_BYTES) return { imageUrl: null };
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_ARTICLE_BYTES) return { imageUrl: null };
    return { imageUrl: imageUrlFromHtml(html) };
  } catch {
    return { imageUrl: null };
  }
}

function isRecent(publishedAt: string | null, now = Date.now()) {
  if (!publishedAt) return false;
  const timestamp = Date.parse(publishedAt);
  return !Number.isNaN(timestamp) && now - timestamp <= MAX_ARTICLE_AGE_DAYS * 86_400_000;
}

async function fetchFeed(source: MediumSource) {
  if (!source.feed_url) throw new Error("MISSING_FEED_URL");
  const url = validateMediumFeedUrl(source.feed_url);
  const headers = new Headers({ Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" });
  if (source.etag) headers.set("If-None-Match", source.etag);
  if (source.last_modified) headers.set("If-Modified-Since", source.last_modified);

  const response = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (response.url) validateMediumFeedUrl(response.url);
  if (response.status === 304) return { unchanged: true as const, candidates: [], etag: source.etag, lastModified: source.last_modified };
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  const xml = await response.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  return {
    unchanged: false as const,
    candidates: parseRssFeed(xml),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function ingestMediumSource(supabase: SupabaseClient, source: MediumSource, interestRows: InterestRow[]): Promise<SourceResult> {
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ source_id: source.id, status: "running", started_at: startedAt })
    .select("id")
    .single();
  if (runError || !run) return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, status: "failed", errorCode: "RUN_CREATE_FAILED" };

  try {
    const feed = await fetchFeed(source);
    let inserted = 0;
    let duplicates = 0;

    const recentCandidates = feed.candidates.filter((candidate) => isRecent(candidate.publishedAt)).slice(0, MAX_CANDIDATES_PER_SOURCE);
    const candidates = await Promise.all(recentCandidates.map(async (candidate) => ({ candidate, metadata: await fetchArticleMetadata(candidate.canonicalUrl) })));

    for (const { candidate, metadata } of candidates) {
      const hash = urlHash(candidate.canonicalUrl);
      const imageUrl = candidate.imageUrl ?? metadata.imageUrl;
      const { data: existing, error: lookupError } = await supabase.from("content_items").select("id").eq("url_hash", hash).maybeSingle();
      if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");

      let contentItemId = existing?.id as string | undefined;
      if (contentItemId) {
        duplicates += 1;
        if (imageUrl) {
          await supabase.from("content_items").update({ image_url: imageUrl, updated_at: new Date().toISOString() }).eq("id", contentItemId);
        }
      } else {
        const { data: created, error: insertError } = await supabase
          .from("content_items")
          .insert({
            source_id: source.id,
            external_id: candidate.externalId,
            canonical_url: candidate.canonicalUrl,
            url_hash: hash,
            title: candidate.title,
            author: candidate.author,
            summary: candidate.summary,
            image_url: imageUrl,
            published_at: candidate.publishedAt,
            fetched_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (insertError?.code === "23505") {
          const { data: raced } = await supabase.from("content_items").select("id").eq("url_hash", hash).single();
          contentItemId = raced?.id as string | undefined;
          duplicates += 1;
        } else if (insertError || !created) {
          throw new Error("ITEM_INSERT_FAILED");
        } else {
          contentItemId = created.id as string;
          inserted += 1;
        }
      }

      if (!contentItemId) throw new Error("ITEM_ID_MISSING");

      const matches = classifyContent(candidate.title, candidate.summary, source.name);
      const topicLinks = matches.flatMap((match) => {
        const row = interestRows.find((topic) => topic.name === match.name);
        return row ? [{ content_item_id: contentItemId, topic_id: row.id }] : [];
      });
      if (topicLinks.length) {
        const { error: topicError } = await supabase.from("content_item_topics").upsert(topicLinks, { onConflict: "content_item_id,topic_id" });
        if (topicError) throw new Error("TOPIC_LINK_FAILED");
      }
    }

    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase
        .from("sources")
        .update({
          etag: feed.etag,
          last_modified: feed.lastModified,
          last_fetched_at: finishedAt,
          last_success_at: finishedAt,
          last_error: null,
          updated_at: finishedAt,
        })
        .eq("id", source.id),
      supabase
        .from("ingestion_runs")
        .update({
          status: "succeeded",
          completed_at: finishedAt,
          items_seen: candidates.length,
          items_inserted: inserted,
          items_skipped: duplicates,
          error_count: 0,
          error_message: null,
        })
        .eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: candidates.length, inserted, duplicates, status: "succeeded" };
  } catch (error) {
    const code = errorCode(error);
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("sources").update({ last_fetched_at: finishedAt, last_error: code, updated_at: finishedAt }).eq("id", source.id),
      supabase.from("ingestion_runs").update({ status: "failed", completed_at: finishedAt, error_count: 1, error_message: code }).eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, status: "failed", errorCode: code };
  }
}
