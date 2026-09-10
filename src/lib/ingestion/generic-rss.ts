import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { qualifyCandidate } from "@/lib/qualification";
import { loadRecentTitles, loadSourceQualificationContext, logQualificationBatch, type QualificationLogEntry } from "@/lib/qualification/store";
import { isNearDuplicateTitle } from "@/lib/qualification/reject";
import { mergeExtraction, needsEnrichment } from "@/lib/ingestion/enrich";
import { assertPublicHttpUrl, MARKY_USER_AGENT } from "@/lib/ingestion/network";
import { parseRssFeed } from "@/lib/ingestion/rss";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
import { fetchWebMetadata } from "@/lib/ingestion/web";
import { urlHash } from "@/lib/url";

const MAX_FEED_BYTES = 5_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_ARTICLE_AGE_DAYS = 30;
const MAX_CANDIDATES_PER_SOURCE = 20;
// Page fetches share the cron route's 60s budget with up to three other
// sources. Twelve at four-wide is three waves, which fits even when a
// publisher is slow; anything past the cap keeps the feed's version.
const MAX_ENRICHMENTS_PER_RUN = 12;
const ENRICH_CONCURRENCY = 4;

function safeErrorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "INGESTION_FAILED";
}

async function fetchFeed(source: IngestionSource) {
  if (!source.feed_url) throw new Error("MISSING_FEED_URL");
  let url = await assertPublicHttpUrl(source.feed_url);
  const headers = new Headers({
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
    "User-Agent": MARKY_USER_AGENT,
  });
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
  if (runError || !run) return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, status: "failed", errorCode: "RUN_CREATE_FAILED" };

  try {
    const feed = await fetchFeed(source);
    const qualificationContext = await loadSourceQualificationContext(supabase, source.id, source.trust_tier);
    const sourceTopicIds = qualificationContext.topicIds;
    // loadSourceQualificationContext deliberately falls back to scoring against
    // every alias when a source declares no topics. That is tolerable for an
    // official publisher feed; for a community source such as a Medium tag it
    // would accept a post about any of the 12 topics. Fail the run loudly
    // instead -- the code lands in sources.last_error and on /debug/ingestion.
    if (!sourceTopicIds.length && (source.trust_tier ?? "official") !== "official") {
      throw new Error("SOURCE_TOPICS_MISSING");
    }
    const maxAgeDays = source.max_article_age_days ?? MAX_ARTICLE_AGE_DAYS;
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const candidates = feed.candidates.filter((candidate) => candidate.publishedAt && Date.parse(candidate.publishedAt) >= cutoff).slice(0, MAX_CANDIDATES_PER_SOURCE);
    let inserted = 0;
    let duplicates = 0;
    let rejected = 0;
    // Titles accepted earlier in this same run are not in the database yet, but
    // a feed can still offer two near-identical items in one batch.
    const seenTitles = [...qualificationContext.recentTitles];

    // Pass 1: which entries are new. One query for the whole batch rather than
    // one per candidate -- a feed offering 20 already-stored items used to cost
    // 20 sequential round trips (~18s observed) to learn nothing.
    const hashes = candidates.map((candidate) => urlHash(candidate.canonicalUrl));
    const { data: existingRows, error: lookupError } = await supabase
      .from("content_items")
      .select("id,url_hash")
      .in("url_hash", hashes);
    if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");
    const existingByHash = new Map((existingRows ?? []).map((row) => [row.url_hash as string, row.id as string]));
    const prepared = candidates.map((candidate, index) => ({
      candidate,
      hash: hashes[index],
      existingId: existingByHash.get(hashes[index]),
    }));

    // Pass 2: fetch the source page for new entries the feed under-described
    // (no image, or a body shorter than the substance bar) *before* scoring,
    // so the gate judges the article rather than the teaser. Same guarded
    // fetch the submission worker and the backfill use. A failed fetch keeps
    // the feed's version; it never fails the run.
    const toEnrich = prepared
      .filter((entry) => !entry.existingId && needsEnrichment(entry.candidate))
      .slice(0, MAX_ENRICHMENTS_PER_RUN);
    await runWithConcurrency(toEnrich, ENRICH_CONCURRENCY, async (entry) => {
      try {
        entry.candidate = mergeExtraction(entry.candidate, await fetchWebMetadata(entry.candidate.canonicalUrl));
      } catch {
        // The feed entry stands, and the qualification log records what it scored.
      }
    });

    // Pass 3: score every new candidate. Pure and sequential -- sequential
    // because near-duplicate detection measures each title against the ones
    // already accepted in this run.
    const verdictLog: QualificationLogEntry[] = [];
    const accepted = new Set<string>();
    for (const { candidate, hash, existingId } of prepared) {
      if (existingId) continue;
      const verdict = qualifyCandidate(
        {
          title: candidate.title,
          summary: candidate.summary,
          bodyText: candidate.bodyText,
          canonicalUrl: candidate.canonicalUrl,
          publishedAt: candidate.publishedAt,
        },
        {
          aliases: qualificationContext.aliases,
          trust: qualificationContext.trust,
          recentTitles: seenTitles,
        },
      );
      verdictLog.push({ candidate, result: verdict, urlHash: hash, topicId: sourceTopicIds[0] ?? null });
      if (verdict.accepted) {
        accepted.add(hash);
        seenTitles.push(candidate.title);
      } else {
        rejected += 1;
      }
    }

    // Written before any insert, in one round trip, so a later insert failure
    // cannot lose the record of what the gate decided.
    await logQualificationBatch(supabase, verdictLog, source.id);

    // Sources run concurrently, and each loaded its recent titles before any of
    // them inserted anything -- so two feeds carrying the same syndicated story
    // in one wave cannot see each other. Re-read the titles now and drop any
    // accepted candidate a sibling run has stored in the meantime. One query,
    // and it closes the window that produced the Google Blog / DeepMind Blog
    // pairs already in the table.
    if (accepted.size) {
      const freshTitles = await loadRecentTitles(supabase);
      const known = new Set(qualificationContext.recentTitles);
      const arrivedSince = freshTitles.filter((title) => !known.has(title));
      if (arrivedSince.length) {
        for (const { candidate, hash } of prepared) {
          if (!accepted.has(hash)) continue;
          if (isNearDuplicateTitle(candidate.title, arrivedSince)) {
            accepted.delete(hash);
            rejected += 1;
          }
        }
      }
    }

    for (const { candidate, hash, existingId } of prepared) {
      let contentItemId = existingId;

      if (contentItemId) {
        duplicates += 1;
      } else {
        if (!accepted.has(hash)) continue;

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
            body_content: candidate.bodyText,
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

      const keywordTopicIds = classifyContent(candidate.title, candidate.summary, candidate.bodyText).flatMap((match) => {
        const topic = interests.find((row) => row.name === match.name);
        return topic ? [topic.id] : [];
      });
      const topicLinks = [...new Set([...sourceTopicIds, ...keywordTopicIds])]
        .map((topicId) => ({ content_item_id: contentItemId, topic_id: topicId }));
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
          items_skipped: duplicates + rejected,
          error_count: 0,
          error_message: null,
        })
        .eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: candidates.length, inserted, duplicates, rejected, status: "succeeded" };
  } catch (error) {
    const code = safeErrorCode(error);
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("sources").update({ last_fetched_at: finishedAt, last_error: code, updated_at: finishedAt }).eq("id", source.id),
      supabase.from("ingestion_runs").update({ status: "failed", completed_at: finishedAt, error_count: 1, error_message: code }).eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, status: "failed", errorCode: code };
  }
}
