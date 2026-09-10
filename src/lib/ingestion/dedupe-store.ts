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

/**
 * Moves every reference from the losing rows onto the keeper.
 *
 * Order matters. Each move is an upsert against the table's own uniqueness rule
 * -- a user who saved both copies, or a topic linked to both, must not fail the
 * merge -- and the delete only runs once nothing points at the losers except
 * the cascade itself.
 */
async function mergeGroup(client: SupabaseClient, group: DuplicateGroup) {
  const removeIds = group.remove.map((item) => item.id);
  let savedItemsRepointed = 0;
  let submissionsRepointed = 0;
  let topicLinksMerged = 0;

  const { data: topicRows, error: topicError } = await client
    .from("content_item_topics")
    .select("topic_id")
    .in("content_item_id", removeIds);
  if (topicError) throw new Error("DEDUPE_TOPIC_READ_FAILED");
  const topicIds = [...new Set((topicRows ?? []).map((row) => row.topic_id as string))];
  if (topicIds.length) {
    const { error } = await client
      .from("content_item_topics")
      .upsert(topicIds.map((topicId) => ({ content_item_id: group.keep.id, topic_id: topicId })), {
        onConflict: "content_item_id,topic_id",
      });
    if (error) throw new Error("DEDUPE_TOPIC_MERGE_FAILED");
    topicLinksMerged = topicIds.length;
  }

  const { data: savedRows, error: savedError } = await client
    .from("saved_items")
    .select("user_id,is_read,saved_at")
    .in("content_item_id", removeIds);
  if (savedError) throw new Error("DEDUPE_SAVED_READ_FAILED");
  const saved = (savedRows ?? []) as Array<{ user_id: string; is_read: boolean | null; saved_at: string | null }>;
  if (saved.length) {
    // One row per user: the same story saved twice collapses to a single save,
    // read if either copy was read, dated from the earlier save.
    const byUser = new Map<string, { user_id: string; content_item_id: string; is_read: boolean; saved_at: string | null }>();
    for (const row of saved) {
      const existing = byUser.get(row.user_id);
      const savedAt = row.saved_at ?? null;
      if (!existing) {
        byUser.set(row.user_id, { user_id: row.user_id, content_item_id: group.keep.id, is_read: Boolean(row.is_read), saved_at: savedAt });
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
  // article it produced.
  const { data: submissionRows, error: submissionError } = await client
    .from("user_submissions")
    .update({ content_item_id: group.keep.id })
    .in("content_item_id", removeIds)
    .select("id");
  if (submissionError) throw new Error("DEDUPE_SUBMISSION_MERGE_FAILED");
  submissionsRepointed = (submissionRows ?? []).length;

  const { error: deleteError } = await client.from("content_items").delete().in("id", removeIds);
  if (deleteError) throw new Error("DEDUPE_DELETE_FAILED");

  return { savedItemsRepointed, submissionsRepointed, topicLinksMerged, itemsRemoved: removeIds.length };
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
