import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { assertPublicHttpUrl } from "@/lib/ingestion/network";
import { parseRssFeed } from "@/lib/ingestion/rss";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
import { urlHash } from "@/lib/url";

const MAX_FEED_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_AGE_DAYS = 30;
const MAX_CANDIDATES_PER_SOURCE = 20;

function safeErrorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "INGESTION_FAILED";
}

async function fetchFeed(source: IngestionSource) {
  if (!source.feed_url) throw new Error("MISSING_FEED_URL");
  let url = await assertPublicHttpUrl(source.feed_url);
  const headers = new Headers({ Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9" });
  if (source.etag) headers.set("If-None-Match", source.etag);
  if (source.last_modified) headers.set("If-Modified-Since", source.last_modified);

  let response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  let redirectCount = 0;
  while (response.status >= 300 && response.status < 400 && redirectCount < 3) {
    const location = response.headers.get("location");
    if (!location) break;
    const nextUrlStr = new URL(location, url).toString();
    url = await assertPublicHttpUrl(nextUrlStr);
    redirectCount += 1;
    response = await fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  }

  if (response.status === 304) return { candidates: [], etag: source.etag, lastModified: source.last_modified };
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("xml") && !contentType.includes("rss") && !contentType.includes("atom")) throw new Error("UNEXPECTED_CONTENT_TYPE");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  const xml = await response.text();
  if (Buffer.byteLength(xml, "utf8") > MAX_FEED_BYTES) throw new Error("FEED_TOO_LARGE");
  return { candidates: parseRssFeed(xml), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
}

export async function ingestGenericRssSource(supabase: SupabaseClient, source: IngestionSource, interests: InterestRow[]): Promise<SourceResult> {
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ source_id: source.id, status: "running", started_at: startedAt })
    .select("id")
    .single();
  if (runError || !run) return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, status: "failed", errorCode: "RUN_CREATE_FAILED" };

  try {
    const feed = await fetchFeed(source);
    const lowFrequencySources = new Set(["React Blog", "TypeScript Blog"]);
    const maxAgeDays = source.max_article_age_days ?? (lowFrequencySources.has(source.name) ? 365 : MAX_ARTICLE_AGE_DAYS);
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const candidates = feed.candidates.filter((candidate) => candidate.publishedAt && Date.parse(candidate.publishedAt) >= cutoff).slice(0, MAX_CANDIDATES_PER_SOURCE);
    let inserted = 0;
    let duplicates = 0;

    for (const candidate of candidates) {
      const hash = urlHash(candidate.canonicalUrl);
      const { data: existing, error: lookupError } = await supabase.from("content_items").select("id").eq("url_hash", hash).maybeSingle();
      if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");
      let contentItemId = existing?.id as string | undefined;

      if (contentItemId) {
        duplicates += 1;
      } else {
        const { data: created, error } = await supabase
          .from("content_items")
          .insert({
            source_id: source.id,
            external_id: candidate.externalId,
            canonical_url: candidate.canonicalUrl,
            url_hash: hash,
            title: candidate.title,
            author: candidate.author,
            summary: candidate.summary,
            image_url: candidate.imageUrl,
            published_at: candidate.publishedAt,
            fetched_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error?.code === "23505") {
          const { data: raced } = await supabase.from("content_items").select("id").eq("url_hash", hash).single();
          contentItemId = raced?.id as string | undefined;
          duplicates += 1;
        } else if (error || !created) {
          throw new Error("ITEM_INSERT_FAILED");
        } else {
          contentItemId = created.id as string;
          inserted += 1;
        }
      }

      if (!contentItemId) throw new Error("ITEM_ID_MISSING");

      const topicLinks = classifyContent(candidate.title, candidate.summary, source.name).flatMap((match) => {
        const topic = interests.find((row) => row.name === match.name);
        return topic ? [{ content_item_id: contentItemId, topic_id: topic.id }] : [];
      });
      if (topicLinks.length) {
        const { error } = await supabase.from("content_item_topics").upsert(topicLinks, { onConflict: "content_item_id,topic_id" });
        if (error) throw new Error("TOPIC_LINK_FAILED");
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
    const code = safeErrorCode(error);
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("sources").update({ last_fetched_at: finishedAt, last_error: code, updated_at: finishedAt }).eq("id", source.id),
      supabase.from("ingestion_runs").update({ status: "failed", completed_at: finishedAt, error_count: 1, error_message: code }).eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, status: "failed", errorCode: code };
  }
}
