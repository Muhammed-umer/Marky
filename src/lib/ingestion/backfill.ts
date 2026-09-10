import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyContent } from "@/lib/ingestion/classify";
import { fetchWebMetadata } from "@/lib/ingestion/web";
import { qualifyCandidate } from "@/lib/qualification";
import { logQualification } from "@/lib/qualification/store";
import type { QualificationCandidate, TrustTier } from "@/lib/qualification/types";
import { interests, type Interest } from "@/lib/types";
import { canonicalizeUrl, urlHash } from "@/lib/url";

export const DEFAULT_BACKFILL_BATCH = 20;
export const MAX_BACKFILL_BATCH = 50;

export interface BackfillItemReport {
  id: string;
  title: string;
  url: string;
  imageFound: boolean;
  bodyWords: number;
  score: number | null;
  reason: string;
  action: "kept" | "hidden" | "extraction_failed";
}

export interface BackfillReport {
  dryRun: boolean;
  processed: number;
  remaining: number;
  imagesAdded: number;
  bodiesAdded: number;
  hidden: number;
  extractionFailures: number;
  scoreDistribution: Record<string, number>;
  items: BackfillItemReport[];
}

interface ContentRow {
  id: string;
  canonical_url: string;
  title: string;
  summary: string | null;
  body_content: string | null;
  image_url: string | null;
  published_at: string | null;
  source_id: string | null;
}

/** 0.0-0.1, 0.1-0.2, ... so the shape of the gate is visible at a glance. */
function bucket(score: number): string {
  const lower = Math.min(0.9, Math.floor(score * 10) / 10);
  return `${lower.toFixed(1)}-${(lower + 0.1).toFixed(1)}`;
}

/**
 * One-off re-extraction of rows stored before images, body text and the
 * qualification gate existed. Resumable: every row it touches gets
 * backfilled_at, so a failed extraction is not retried forever, and rows that
 * fall below the threshold are hidden rather than deleted — deleting would
 * cascade away someone's saved_items row.
 */
export async function runBackfill(
  client: SupabaseClient,
  { limit = DEFAULT_BACKFILL_BATCH, dryRun = true }: { limit?: number; dryRun?: boolean } = {},
): Promise<BackfillReport> {
  const batch = Math.min(Math.max(1, limit), MAX_BACKFILL_BATCH);

  const { data: rows, error } = await client
    .from("content_items")
    .select("id,canonical_url,title,summary,body_content,image_url,published_at,source_id")
    .is("backfilled_at", null)
    .order("fetched_at", { ascending: true })
    .limit(batch);
  if (error) throw new Error("BACKFILL_QUERY_FAILED");

  const items = (rows ?? []) as ContentRow[];
  const sourceIds = [...new Set(items.map((row) => row.source_id).filter((id): id is string => Boolean(id)))];

  const [{ data: sourceRows }, { data: aliasRows }, { data: sourceTopicRows }] = await Promise.all([
    sourceIds.length
      ? client.from("sources").select("id,trust_tier").in("id", sourceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; trust_tier: string }> }),
    client.from("topic_aliases").select("topic_id,alias"),
    sourceIds.length
      ? client.from("source_topics").select("source_id,topic_id").in("source_id", sourceIds)
      : Promise.resolve({ data: [] as Array<{ source_id: string; topic_id: string }> }),
  ]);

  const trustBySource = new Map((sourceRows ?? []).map((row) => [row.id as string, row.trust_tier as TrustTier]));
  const aliases = (aliasRows ?? []) as Array<{ topic_id: string; alias: string }>;
  const topicsBySource = new Map<string, string[]>();
  for (const row of (sourceTopicRows ?? []) as Array<{ source_id: string; topic_id: string }>) {
    topicsBySource.set(row.source_id, [...(topicsBySource.get(row.source_id) ?? []), row.topic_id]);
  }

  const report: BackfillReport = {
    dryRun,
    processed: 0,
    remaining: 0,
    imagesAdded: 0,
    bodiesAdded: 0,
    hidden: 0,
    extractionFailures: 0,
    scoreDistribution: {},
    items: [],
  };

  for (const row of items) {
    let imageUrl = row.image_url;
    let bodyText = row.body_content;
    let extractionFailed = false;

    try {
      // Same guarded fetch the submission worker uses: SSRF checks, size caps,
      // redirect limits. No second fetch path.
      const metadata = await fetchWebMetadata(row.canonical_url);
      imageUrl = imageUrl ?? metadata.imageUrl;
      bodyText = bodyText ?? metadata.bodyText;
    } catch {
      extractionFailed = true;
      report.extractionFailures += 1;
    }

    const topicIds = row.source_id ? topicsBySource.get(row.source_id) ?? [] : [];
    const scopedAliases = topicIds.length ? aliases.filter((alias) => topicIds.includes(alias.topic_id)) : aliases;

    const candidate: QualificationCandidate = {
      title: row.title,
      summary: row.summary,
      bodyText,
      canonicalUrl: row.canonical_url,
      publishedAt: row.published_at,
    };
    const verdict = qualifyCandidate(candidate, {
      aliases: [...new Set(scopedAliases.map((alias) => alias.alias.toLowerCase()))],
      trust: (row.source_id ? trustBySource.get(row.source_id) : undefined) ?? "unknown",
      // Existing rows are the corpus, so near-duplicate comparison against
      // themselves would reject everything.
      recentTitles: [],
    });

    const bodyWords = bodyText ? bodyText.split(/\s+/).filter(Boolean).length : 0;
    report.processed += 1;
    report.scoreDistribution[bucket(verdict.score)] = (report.scoreDistribution[bucket(verdict.score)] ?? 0) + 1;
    if (imageUrl && !row.image_url) report.imagesAdded += 1;
    if (bodyText && !row.body_content) report.bodiesAdded += 1;
    if (!verdict.accepted) report.hidden += 1;

    report.items.push({
      id: row.id,
      title: row.title,
      url: row.canonical_url,
      imageFound: Boolean(imageUrl),
      bodyWords,
      score: verdict.score,
      reason: verdict.reason,
      action: extractionFailed ? "extraction_failed" : verdict.accepted ? "kept" : "hidden",
    });

    if (dryRun) continue;

    const { error: updateError } = await client
      .from("content_items")
      .update({
        image_url: imageUrl,
        body_content: bodyText,
        is_hidden: !verdict.accepted,
        backfilled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updateError) throw new Error("BACKFILL_UPDATE_FAILED");

    await logQualification(client, candidate, verdict, urlHash(row.canonical_url), row.source_id, topicIds[0] ?? null)
      .catch(() => undefined);

    // Re-run classification now that body text exists, and stop relying on the
    // source name. Existing links are left in place; this only adds.
    const keywordTopicNames = classifyContent(row.title, row.summary, bodyText).map((match) => match.name);
    const wanted = [...new Set([...topicIds])];
    if (keywordTopicNames.length) {
      const { data: topicRows } = await client
        .from("topics")
        .select("id,name")
        .in("name", keywordTopicNames.filter((name): name is Interest => interests.includes(name)));
      for (const topic of topicRows ?? []) wanted.push(topic.id as string);
    }
    const links = [...new Set(wanted)].map((topicId) => ({ content_item_id: row.id, topic_id: topicId }));
    if (links.length) {
      await client.from("content_item_topics").upsert(links, { onConflict: "content_item_id,topic_id" });
    }
  }

  const { count } = await client
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .is("backfilled_at", null);
  report.remaining = dryRun ? count ?? 0 : Math.max(0, (count ?? 0));

  return report;
}

export interface RecanonicalizeReport {
  dryRun: boolean;
  scanned: number;
  rewritten: number;
  merged: number;
  savedRelinked: number;
  examples: Array<{ title: string; from: string; to: string; action: "rewritten" | "merged" }>;
}

/**
 * Re-applies the current canonicalisation rules to already-stored URLs, and
 * merges any rows that collapse onto the same hash.
 *
 * `url_hash` is only ever computed at insert time, so a row keeps whatever the
 * rules were on the day it arrived. When `canonicalizeUrl` learns to strip a
 * parameter -- as it did for Medium's per-feed `?source=rss----<tag>` stamp --
 * every row stored before that keeps its old hash and stays a duplicate
 * forever. runBackfill re-scores content but never touched the URL, so its
 * sweeps left these in place.
 *
 * Merging keeps the richest row (image, then body, then oldest) and re-points
 * saved_items before deleting, because that foreign key is ON DELETE CASCADE
 * and would otherwise silently remove somebody's saved article.
 */
export async function recanonicalizeContentUrls(
  client: SupabaseClient,
  { dryRun = true, limit = 2000 }: { dryRun?: boolean; limit?: number } = {},
): Promise<RecanonicalizeReport> {
  const report: RecanonicalizeReport = { dryRun, scanned: 0, rewritten: 0, merged: 0, savedRelinked: 0, examples: [] };

  const { data, error } = await client
    .from("content_items")
    .select("id,canonical_url,url_hash,title,image_url,body_content,fetched_at")
    .order("fetched_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error("RECANONICALIZE_QUERY_FAILED");

  const rows = (data ?? []) as Array<{
    id: string; canonical_url: string; url_hash: string; title: string;
    image_url: string | null; body_content: string | null; fetched_at: string;
  }>;
  report.scanned = rows.length;

  // Richest row wins, oldest breaks the tie -- never trade away an image.
  const rank = (row: (typeof rows)[number]) => (row.image_url ? 2 : 0) + (row.body_content ? 1 : 0);

  const byHash = new Map<string, (typeof rows)[number]>();
  const pending: Array<{ row: (typeof rows)[number]; url: string; hash: string }> = [];

  for (const row of rows) {
    let url: string;
    let hash: string;
    try {
      url = canonicalizeUrl(row.canonical_url);
      hash = urlHash(row.canonical_url);
    } catch {
      continue; // Unparseable stored URL; leave it exactly as it is.
    }
    pending.push({ row, url, hash });
    const held = byHash.get(hash);
    if (!held || rank(row) > rank(held)) byHash.set(hash, row);
  }

  for (const { row, url, hash } of pending) {
    const keeper = byHash.get(hash)!;
    const isDuplicate = keeper.id !== row.id;

    if (!isDuplicate && hash === row.url_hash) continue;

    if (report.examples.length < 6) {
      report.examples.push({
        title: row.title.slice(0, 46),
        from: row.canonical_url.slice(0, 62),
        to: isDuplicate ? `merged into ${keeper.id.slice(0, 8)}` : url.slice(0, 62),
        action: isDuplicate ? "merged" : "rewritten",
      });
    }

    if (isDuplicate) {
      report.merged += 1;
      if (dryRun) continue;
      const { data: saves } = await client.from("saved_items").select("user_id").eq("content_item_id", row.id);
      for (const save of saves ?? []) {
        report.savedRelinked += 1;
        // A conflict means that user already saved the keeper, so the cascade
        // removing this row is the correct outcome.
        await client
          .from("saved_items")
          .update({ content_item_id: keeper.id })
          .eq("content_item_id", row.id)
          .eq("user_id", save.user_id as string);
      }
      await client.from("content_items").delete().eq("id", row.id);
      continue;
    }

    report.rewritten += 1;
    if (dryRun) continue;
    const { error: updateError } = await client
      .from("content_items")
      .update({ canonical_url: url, url_hash: hash, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    // 23505 means another row already holds this hash; the merge pass above
    // owns that case, so leave the row for the next run rather than failing.
    if (updateError && updateError.code !== "23505") throw new Error("RECANONICALIZE_UPDATE_FAILED");
  }

  return report;
}
