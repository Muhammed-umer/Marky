import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QualificationCandidate, QualificationResult, TrustTier } from "@/lib/qualification/types";

const RECENT_TITLE_DAYS = 30;
const RECENT_TITLE_LIMIT = 500;
const TRUST_TIERS = new Set<TrustTier>(["official", "community", "probationary", "unknown"]);

export interface SourceQualificationContext {
  aliases: string[];
  trust: TrustTier;
  recentTitles: string[];
  topicIds: string[];
}

function asTrustTier(value: unknown): TrustTier {
  return typeof value === "string" && TRUST_TIERS.has(value as TrustTier) ? (value as TrustTier) : "unknown";
}

/**
 * Everything the pure scorer needs, read once per source run rather than per
 * candidate. A source with no declared topics is measured against every alias,
 * so it can still earn relevance rather than being rejected by configuration.
 */
/**
 * Recent titles, newest first. Exported so a run can re-read them after scoring
 * to catch a story a concurrently running source stored in the meantime.
 */
export async function loadRecentTitles(client: SupabaseClient): Promise<string[]> {
  const since = new Date(Date.now() - RECENT_TITLE_DAYS * 86_400_000).toISOString();
  const { data } = await client
    .from("content_items")
    .select("title")
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(RECENT_TITLE_LIMIT);
  return (data ?? []).map((row) => row.title as string);
}

export async function loadSourceQualificationContext(
  client: SupabaseClient,
  sourceId: string,
  trustTier: unknown,
): Promise<SourceQualificationContext> {
  const since = new Date(Date.now() - RECENT_TITLE_DAYS * 86_400_000).toISOString();
  const [{ data: sourceTopicRows }, { data: aliasRows }, { data: titleRows }] = await Promise.all([
    client.from("source_topics").select("topic_id").eq("source_id", sourceId),
    client.from("topic_aliases").select("topic_id,alias"),
    // Ordered so the cap keeps the *newest* titles. Without it the 500 rows are
    // arbitrary, and near-duplicate detection gets less reliable as the corpus
    // grows -- which is exactly what adding community sources does.
    client.from("content_items").select("title").gte("fetched_at", since)
      .order("fetched_at", { ascending: false }).limit(RECENT_TITLE_LIMIT),
  ]);

  const topicIds = (sourceTopicRows ?? []).map((row) => row.topic_id as string);
  const allAliases = (aliasRows ?? []) as Array<{ topic_id: string; alias: string }>;
  const scoped = topicIds.length ? allAliases.filter((row) => topicIds.includes(row.topic_id)) : allAliases;

  return {
    topicIds,
    aliases: [...new Set(scoped.map((row) => row.alias.toLowerCase()))],
    trust: asTrustTier(trustTier),
    recentTitles: (titleRows ?? []).map((row) => row.title as string),
  };
}

export interface QualificationLogEntry {
  candidate: QualificationCandidate;
  result: QualificationResult;
  urlHash: string;
  topicId?: string | null;
}

function logRow(entry: QualificationLogEntry, sourceId: string | null) {
  return {
    url_hash: entry.urlHash,
    canonical_url: entry.candidate.canonicalUrl,
    title: entry.candidate.title.slice(0, 500),
    source_id: sourceId,
    topic_id: entry.topicId ?? null,
    score: Number(entry.result.score.toFixed(3)),
    decision: entry.result.accepted ? "accepted" : "rejected",
    reason: entry.result.reason,
    signals: entry.result.breakdown,
  };
}

/**
 * Records one verdict. The unique (url_hash, day) index means a feed re-offering
 * the same rejected item does not grow the log, so a conflict is expected and
 * ignored rather than treated as a failure.
 */
export async function logQualification(
  client: SupabaseClient,
  candidate: QualificationCandidate,
  result: QualificationResult,
  urlHashValue: string,
  sourceId: string | null,
  topicId: string | null = null,
): Promise<void> {
  // The uniqueness rule lives in an expression index on (url_hash, created_at::date),
  // which PostgREST cannot target with on_conflict, so the conflict is caught here.
  const { error } = await client
    .from("discovery_candidates")
    .insert(logRow({ candidate, result, urlHash: urlHashValue, topicId }, sourceId));
  if (error && error.code !== "23505") throw new Error("CANDIDATE_LOG_FAILED");
}

/**
 * One round trip for a whole source run instead of one per candidate.
 *
 * A single 23505 anywhere in the batch would reject every row, and re-offered
 * items conflict routinely, so on conflict the batch is retried row by row.
 * That path is the exception, not the norm: it only costs round trips on runs
 * that re-offer something already logged today.
 */
export async function logQualificationBatch(
  client: SupabaseClient,
  entries: QualificationLogEntry[],
  sourceId: string | null,
): Promise<void> {
  if (!entries.length) return;
  const { error } = await client.from("discovery_candidates").insert(entries.map((entry) => logRow(entry, sourceId)));
  if (!error) return;
  if (error.code !== "23505") throw new Error("CANDIDATE_LOG_FAILED");
  for (const entry of entries) {
    await logQualification(client, entry.candidate, entry.result, entry.urlHash, sourceId, entry.topicId ?? null);
  }
}
