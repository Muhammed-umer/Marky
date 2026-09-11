import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findDuplicateGroups, type DedupeItem, type DuplicateGroup } from "@/lib/dedupe";

/**
 * Removes near-duplicate `content_items` that were stored before the
 * qualification gate covered their ingestion path.
 *
 * `url_hash` is UNIQUE, so exact-URL duplicates cannot exist; everything this
 * finds is the same story under two different URLs. Deletion cascades to
 * `content_item_topics`, `saved_items` and `content_item_signals`, so every
 * reference is moved onto the survivor *before* the delete -- a user who saved
 * the losing row keeps the story, pointing at the better copy.
 */

export const DEFAULT_DEDUPE_WINDOW_DAYS = 90;
export const DEFAULT_DEDUPE_LIMIT = 2000;

export interface DedupeOptions {
  /** Only consider items fetched within this many days. */
  windowDays?: number;
  /** Cap on rows loaded in one pass, newest first. */
  limit?: number;
  /** When true (the default) nothing is written. */
  dryRun?: boolean;
}

export interface DedupeGroupReport {
  keepId: string;
  keepTitle: string;
  keepUrl: string;
  removed: Array<{ id: string; title: string; url: string }>;
}

export interface DedupeReport {
  scanned: number;
  duplicateGroups: number;
  itemsRemoved: number;
  savedItemsRepointed: number;
  submissionsRepointed: number;
  topicLinksMerged: number;
  dryRun: boolean;
  groups: DedupeGroupReport[];
}

function toReport(group: DuplicateGroup): DedupeGroupReport {
  return {
    keepId: group.keep.id,
    keepTitle: group.keep.title,
    keepUrl: group.keep.canonicalUrl,
    removed: group.remove.map((item) => ({ id: item.id, title: item.title, url: item.canonicalUrl })),
  };
}

async function loadItems(client: SupabaseClient, windowDays: number, limit: number): Promise<DedupeItem[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await client
    .from("content_items")
    .select("id,title,canonical_url,body_content,image_url,author,published_at,fetched_at")
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("DEDUPE_LOAD_FAILED");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    canonicalUrl: (row.canonical_url as string) ?? "",
    bodyContent: (row.body_content as string | null) ?? null,
    imageUrl: (row.image_url as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    fetchedAt: (row.fetched_at as string | null) ?? null,
  }));
}

export interface MergeResult {
  savedItemsRepointed: number;
  submissionsRepointed: number;
  topicLinksMerged: number;
  itemsRemoved: number;
}

/**
 * Collapses `removeIds` into `keepId`: moves every reference from the losing
 * rows onto the keeper, then deletes the losers. The one way a content item is
 * ever merged away -- the near-duplicate sweep and the URL recanonicalisation
 * both call this, so neither can forget a table the other remembers.
 *
 * Order matters. Each move is an upsert against the table's own uniqueness rule
 * -- a user who saved both copies, or a topic linked to both, must not fail the
 * merge -- and the delete only runs once nothing points at the losers except
 * the cascade itself.
 */
export async function mergeContentItems(client: SupabaseClient, keepId: string, removeIds: string[]): Promise<MergeResult> {
  let savedItemsRepointed = 0;
  let submissionsRepointed = 0;
  let topicLinksMerged = 0;
  if (!removeIds.length) return { savedItemsRepointed, submissionsRepointed, topicLinksMerged, itemsRemoved: 0 };

  const { data: topicRows, error: topicError } = await client
    .from("content_item_topics")
    .select("topic_id")
    .in("content_item_id", removeIds);
  if (topicError) throw new Error("DEDUPE_TOPIC_READ_FAILED");
  const topicIds = [...new Set((topicRows ?? []).map((row) => row.topic_id as string))];
  if (topicIds.length) {
    const { error } = await client
      .from("content_item_topics")
      .upsert(topicIds.map((topicId) => ({ content_item_id: keepId, topic_id: topicId })), {
        onConflict: "content_item_id,topic_id",
      });
    if (error) throw new Error("DEDUPE_TOPIC_MERGE_FAILED");
    topicLinksMerged = topicIds.length;
  }

  type SavedRow = { content_item_id: string; user_id: string; is_read: boolean | null; saved_at: string | null };
  const { data: losingRows, error: savedError } = await client
    .from("saved_items")
    .select("content_item_id,user_id,is_read,saved_at")
    .in("content_item_id", removeIds);
  if (savedError) throw new Error("DEDUPE_SAVED_READ_FAILED");
  const losingSaves = (losingRows ?? []) as SavedRow[];
  if (losingSaves.length) {
    // The keeper's own saves are read too, for just the readers involved: one
    // who saved both copies and read only the keeper must not have that read
    // state overwritten by the losing copy's `false`, nor their save re-dated
    // to the later one. Scoped to those users so a well-saved keeper cannot
    // push its rows past the response cap and out of the merge.
    const affected = new Set(losingSaves.map((row) => row.user_id));
    const { data: keeperRows, error: keeperError } = await client
      .from("saved_items")
      .select("content_item_id,user_id,is_read,saved_at")
      .eq("content_item_id", keepId)
      .in("user_id", [...affected]);
    if (keeperError) throw new Error("DEDUPE_SAVED_READ_FAILED");

    // One row per user: the same story saved twice collapses to a single save,
    // read if either copy was read, dated from the earlier save.
    const byUser = new Map<string, { user_id: string; content_item_id: string; is_read: boolean; saved_at: string | null }>();
    for (const row of [...losingSaves, ...((keeperRows ?? []) as SavedRow[])]) {
      const existing = byUser.get(row.user_id);
      const savedAt = row.saved_at ?? null;
      if (!existing) {
        byUser.set(row.user_id, { user_id: row.user_id, content_item_id: keepId, is_read: Boolean(row.is_read), saved_at: savedAt });
        continue;
      }
      existing.is_read = existing.is_read || Boolean(row.is_read);
      if (savedAt && (!existing.saved_at || savedAt < existing.saved_at)) existing.saved_at = savedAt;
    }
    // saved_at is NOT NULL with a default, so an unknown date is omitted
    // rather than written as null.
    const rows = [...byUser.values()].map(({ saved_at, ...rest }) => (saved_at ? { ...rest, saved_at } : rest));
    const { error } = await client
      .from("saved_items")
      .upsert(rows, { onConflict: "user_id,content_item_id" });
    if (error) throw new Error("DEDUPE_SAVED_MERGE_FAILED");
    savedItemsRepointed = byUser.size;
  }

  // ON DELETE SET NULL, so without this a submission would silently lose the
  // article it produced -- and the feed's exclusion list, which is keyed on
  // it, would hand the reader's own link back to them on the dashboard.
  const { data: submissionRows, error: submissionError } = await client
    .from("user_submissions")
    .update({ content_item_id: keepId })
    .in("content_item_id", removeIds)
    .select("id");
  if (submissionError) throw new Error("DEDUPE_SUBMISSION_MERGE_FAILED");
  submissionsRepointed = (submissionRows ?? []).length;

  // content_item_signals is ON DELETE CASCADE too. The keeper takes the
  // highest count seen on any copy -- the same "never lowered" rule
  // recordSignals applies -- so a story Hacker News scored does not read as
  // unseen because the publisher's copy happened to win the merge.
  const { data: signalRows, error: signalError } = await client
    .from("content_item_signals")
    .select("content_item_id,engagement_count,source_count,platform,collected_at")
    .in("content_item_id", [keepId, ...removeIds]);
  if (signalError) throw new Error("DEDUPE_SIGNAL_READ_FAILED");
  const signals = (signalRows ?? []) as Array<{
    content_item_id: string; engagement_count: number | null; source_count: number | null; platform: string | null; collected_at: string | null;
  }>;
  if (signals.some((row) => row.content_item_id !== keepId)) {
    const best = signals.reduce((top, row) => ((row.engagement_count ?? 0) > (top.engagement_count ?? 0) ? row : top));
    const { error } = await client.from("content_item_signals").upsert(
      {
        content_item_id: keepId,
        engagement_count: Math.max(...signals.map((row) => row.engagement_count ?? 0)),
        source_count: Math.max(1, ...signals.map((row) => row.source_count ?? 1)),
        platform: best.platform,
        collected_at: best.collected_at ?? new Date().toISOString(),
      },
      { onConflict: "content_item_id" },
    );
    if (error) throw new Error("DEDUPE_SIGNAL_MERGE_FAILED");
  }

  const { error: deleteError } = await client.from("content_items").delete().in("id", removeIds);
  if (deleteError) throw new Error("DEDUPE_DELETE_FAILED");

  return { savedItemsRepointed, submissionsRepointed, topicLinksMerged, itemsRemoved: removeIds.length };
}

function mergeGroup(client: SupabaseClient, group: DuplicateGroup) {
  return mergeContentItems(client, group.keep.id, group.remove.map((item) => item.id));
}

export async function runDedupe(client: SupabaseClient, options: DedupeOptions = {}): Promise<DedupeReport> {
  const windowDays = options.windowDays ?? DEFAULT_DEDUPE_WINDOW_DAYS;
  const limit = options.limit ?? DEFAULT_DEDUPE_LIMIT;
  const dryRun = options.dryRun ?? true;

  const items = await loadItems(client, windowDays, limit);
  const groups = findDuplicateGroups(items);

  const report: DedupeReport = {
    scanned: items.length,
    duplicateGroups: groups.length,
    itemsRemoved: 0,
    savedItemsRepointed: 0,
    submissionsRepointed: 0,
    topicLinksMerged: 0,
    dryRun,
    groups: groups.map(toReport),
  };
  if (dryRun) {
    report.itemsRemoved = groups.reduce((total, group) => total + group.remove.length, 0);
    return report;
  }

  for (const group of groups) {
    const merged = await mergeGroup(client, group);
    report.itemsRemoved += merged.itemsRemoved;
    report.savedItemsRepointed += merged.savedItemsRepointed;
    report.submissionsRepointed += merged.submissionsRepointed;
    report.topicLinksMerged += merged.topicLinksMerged;
  }
  return report;
}
