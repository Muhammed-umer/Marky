import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { resolveConflictingItem } from "@/lib/ingestion/conflict";
import { mergeExtraction, needsEnrichment } from "@/lib/ingestion/enrich";
import { reserveQuota, type QuotaPlatform } from "@/lib/ingestion/quota";
import type { RssCandidate } from "@/lib/ingestion/rss";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
import { fetchWebMetadata } from "@/lib/ingestion/web";
import { qualifyCandidate } from "@/lib/qualification";
import { isNearDuplicateTitle } from "@/lib/qualification/reject";
import type { CandidateKind, EngagementPlatform } from "@/lib/qualification/types";
import {
  loadRecentTitles,
  loadSourceQualificationContext,
  logQualificationBatch,
  type QualificationLogEntry,
} from "@/lib/qualification/store";
import { urlHash } from "@/lib/url";

/**
 * The one interface behind every discovery source.
 *
 * Discovery answers "where is the URL"; everything after that -- extraction,
 * qualification, storage, signals, topic links, run bookkeeping -- is identical
 * whichever platform found it, and lives here. That is what makes a new
 * platform a mapping function plus a config row rather than another copy of
 * this pipeline: the fetch and the mapping are the only parts that differ, and
 * they are the only parts an adapter supplies.
 */

const MAX_CANDIDATES_PER_SOURCE = 20;
const MAX_ENRICHMENTS_PER_RUN = 12;
const ENRICH_CONCURRENCY = 4;
const DEFAULT_MAX_ARTICLE_AGE_DAYS = 30;

export interface DiscoveryHit {
  candidate: RssCandidate;
  /**
   * Reported reactions, scored by the qualification gate. Null means the
   * platform reports nothing at all, which the scorer treats differently from
   * a platform reporting zero.
   */
  engagementCount: number | null;
  /**
   * What to store in content_item_signals when that differs from the scored
   * number -- Hacker News scores on points but stores points plus comments.
   * Defaults to engagementCount.
   */
  signalCount?: number;
}

export interface DiscoveryAdapter {
  platform: EngagementPlatform;
  /** Fetch and map. Throws an UPPER_SNAKE_CASE code on failure. */
  fetchHits: (source: IngestionSource) => Promise<DiscoveryHit[]>;
  /**
   * True when the platform hands over a link but not the article, so the page
   * has to be fetched before substance can be judged. False when the API
   * already returns the body -- a release note, a question, a description.
   */
  enrichFromPage: boolean;
  /**
   * What every hit from this platform is, when it is not an article. The
   * qualification gate reads it: a release note or a video is the whole
   * artefact, so its length says nothing about substance, and a release does
   * not go stale. Left unset, hits are scored as articles.
   */
  kind?: CandidateKind;
  /** Set when the platform publishes a hard request limit worth tracking. */
  quota?: QuotaPlatform;
}

function safeErrorCode(error: unknown) {
  return error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "INGESTION_FAILED";
}

/**
 * source_count rises only when the item was stored by somebody else: the
 * Discovery Map's "the same URL seen on two platforms is one item with a higher
 * source count". The publisher ran it and this platform carried it, so two
 * independent sources have it.
 *
 * "Somebody else" is checked twice, because both halves have been wrong. The
 * row's source_id must differ -- this same source re-seeing its own hit an
 * hour later is not a second source -- and the signals row must not already
 * come from this platform, since two Hacker News queries finding one story are
 * still one platform. Anything looser is a fabricated signal feeding Trending.
 *
 * A recorded count is never lowered. A later search can return a smaller page
 * of the same story, and Trending reading a number that fell for no reason
 * would be worse than one that lags.
 */
async function recordSignals(
  client: SupabaseClient,
  contentItemId: string,
  hit: DiscoveryHit,
  platform: EngagementPlatform,
  storedByAnotherSource: boolean,
) {
  const reported = hit.signalCount ?? hit.engagementCount;
  if (reported == null) return;

  const { data: current } = await client
    .from("content_item_signals")
    .select("engagement_count,source_count,platform")
    .eq("content_item_id", contentItemId)
    .maybeSingle();

  const existingCount = (current?.engagement_count as number | undefined) ?? 0;
  const existingSources = (current?.source_count as number | undefined) ?? 1;
  const samePlatform = (current?.platform as string | null | undefined) === platform;
  const independent = storedByAnotherSource && !samePlatform;

  await client.from("content_item_signals").upsert(
    {
      content_item_id: contentItemId,
      engagement_count: Math.max(Math.max(0, Math.floor(reported)), existingCount),
      source_count: Math.max(existingSources, independent ? 2 : 1),
      platform,
      collected_at: new Date().toISOString(),
    },
    { onConflict: "content_item_id" },
  );
}

export async function runDiscoverySource(
  supabase: SupabaseClient,
  source: IngestionSource,
  interests: InterestRow[],
  adapter: DiscoveryAdapter,
): Promise<SourceResult> {
  const startedAt = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({ source_id: source.id, status: "running", started_at: startedAt })
    .select("id")
    .single();
  if (runError || !run) {
    return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, status: "failed", errorCode: "RUN_CREATE_FAILED" };
  }

  try {
    // Spent before the request, so a failed fetch costs a slot rather than
    // risking a limit breach that would block every source of this type.
    if (adapter.quota && !(await reserveQuota(supabase, adapter.quota))) {
      throw new Error("QUOTA_EXHAUSTED");
    }

    const hits = await adapter.fetchHits(source);
    const qualificationContext = await loadSourceQualificationContext(supabase, source.id, source.trust_tier);
    const sourceTopicIds = qualificationContext.topicIds;
    // A discovery source scored against every alias would attach anything it
    // found to any topic. It has to declare what it is looking for.
    if (!sourceTopicIds.length) throw new Error("SOURCE_TOPICS_MISSING");

    const maxAgeDays = source.max_article_age_days ?? DEFAULT_MAX_ARTICLE_AGE_DAYS;
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const entries = hits
      .filter((hit) => hit.candidate.publishedAt && Date.parse(hit.candidate.publishedAt) >= cutoff)
      .slice(0, MAX_CANDIDATES_PER_SOURCE);

    let inserted = 0;
    let duplicates = 0;
    let rejected = 0;

    // One query for the batch. Asking per candidate cost a round trip each to
    // learn that a source was offering what we already had.
    const hashes = entries.map((entry) => urlHash(entry.candidate.canonicalUrl));
    const { data: existingRows, error: lookupError } = await supabase
      .from("content_items")
      .select("id,url_hash,source_id")
      .in("url_hash", hashes);
    if (lookupError) throw new Error("ITEM_LOOKUP_FAILED");
    const existingByHash = new Map(
      (existingRows ?? []).map((row) => [row.url_hash as string, { id: row.id as string, sourceId: row.source_id as string | null }]),
    );

    const prepared = entries.map((entry, index) => {
      const existing = existingByHash.get(hashes[index]);
      return {
        hit: entry,
        candidate: entry.candidate,
        hash: hashes[index],
        existingId: existing?.id,
        // This source re-seeing its own hit on a later run is not a second
        // source, and a row with no source at all (a reader's submission, or
        // one whose source was deleted) is not one either; see recordSignals.
        storedByAnotherSource: existing?.sourceId != null && existing.sourceId !== source.id,
      };
    });

    if (adapter.enrichFromPage) {
      const toEnrich = prepared
        .filter((entry) => !entry.existingId && needsEnrichment(entry.candidate))
        .slice(0, MAX_ENRICHMENTS_PER_RUN);
      await runWithConcurrency(toEnrich, ENRICH_CONCURRENCY, async (entry) => {
        try {
          entry.candidate = mergeExtraction(entry.candidate, await fetchWebMetadata(entry.candidate.canonicalUrl));
        } catch {
          // Paywalls and blocks are ordinary here. The gate then judges what
          // little is known, and the verdict log records why.
        }
      });
    }

    // Sequential: near-duplicate detection measures each title against the ones
    // already accepted in this run as well as the ones already stored.
    const seenTitles = [...qualificationContext.recentTitles];
    const verdictLog: QualificationLogEntry[] = [];
    const accepted = new Set<string>();

    for (const { hit, candidate, hash, existingId } of prepared) {
      if (existingId) continue;
      const verdict = qualifyCandidate(
        {
          title: candidate.title,
          summary: candidate.summary,
          bodyText: candidate.bodyText,
          canonicalUrl: candidate.canonicalUrl,
          publishedAt: candidate.publishedAt,
          kind: adapter.kind,
          engagementCount: hit.engagementCount,
          platform: adapter.platform,
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

    await logQualificationBatch(supabase, verdictLog, source.id);

    // Sources run four-wide, so another source can have stored the same story
    // between this run's title snapshot and its inserts.
    if (accepted.size) {
      const known = new Set(qualificationContext.recentTitles);
      const arrivedSince = (await loadRecentTitles(supabase)).filter((title) => !known.has(title));
      if (arrivedSince.length) {
        for (const { candidate, hash } of prepared) {
          if (accepted.has(hash) && isNearDuplicateTitle(candidate.title, arrivedSince)) {
            accepted.delete(hash);
            rejected += 1;
          }
        }
      }
    }

    for (const { hit, candidate, hash, existingId, storedByAnotherSource } of prepared) {
      let contentItemId = existingId;

      if (contentItemId) {
        // Already stored, most likely from the publisher's own feed. Not waste:
        // this platform has told us the crowd reacted to it, which is the one
        // signal the RSS layer can never provide.
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
          // A sibling run, or a row stored under an older URL form whose
          // dedupe_key matches. Either way it is stored; see conflict.ts.
          contentItemId = await resolveConflictingItem(supabase, hash, candidate.canonicalUrl);
          duplicates += 1;
        } else if (error || !created) {
          throw new Error("ITEM_INSERT_FAILED");
        } else {
          contentItemId = created.id as string;
          inserted += 1;
        }
      }

      if (!contentItemId) continue;
      await recordSignals(supabase, contentItemId, hit, adapter.platform, storedByAnotherSource);

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
      supabase.from("sources").update({
        last_fetched_at: finishedAt,
        last_success_at: finishedAt,
        last_error: null,
        updated_at: finishedAt,
      }).eq("id", source.id),
      supabase.from("ingestion_runs").update({
        status: "succeeded",
        completed_at: finishedAt,
        items_seen: prepared.length,
        items_inserted: inserted,
        items_skipped: duplicates + rejected,
        error_count: 0,
        error_message: null,
      }).eq("id", run.id),
    ]);

    return { sourceId: source.id, fetched: prepared.length, inserted, duplicates, rejected, status: "succeeded" };
  } catch (error) {
    const errorCode = safeErrorCode(error);
    const finishedAt = new Date().toISOString();
    await Promise.all([
      supabase.from("sources").update({ last_fetched_at: finishedAt, last_error: errorCode, updated_at: finishedAt }).eq("id", source.id),
      supabase.from("ingestion_runs").update({ status: "failed", completed_at: finishedAt, error_message: errorCode, error_count: 1 }).eq("id", run.id),
    ]);
    return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, status: "failed", errorCode };
  }
}
