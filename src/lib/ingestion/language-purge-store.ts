import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planLanguagePurge, type PurgeCandidateRow, type RetentionReason } from "@/lib/language-purge";

/**
 * Removes stored `content_items` the language gate would reject today.
 *
 * The counterpart to `dedupe-store.ts`, and deliberately shaped like it: an
 * operator tool, dry run by default, that applies a rule ingestion already
 * enforces to rows that predate it. Deletion cascades to
 * `content_item_topics` and `content_item_signals`; rows a reader saved or
 * submitted are never deleted (see `planLanguagePurge`).
 */

export const DEFAULT_PURGE_WINDOW_DAYS = 90;
export const DEFAULT_PURGE_LIMIT = 2000;

export interface LanguagePurgeOptions {
  windowDays?: number;
  limit?: number;
  /** When true (the default) nothing is written. */
  dryRun?: boolean;
}

export interface LanguagePurgeReport {
  scanned: number;
  flagged: number;
  itemsRemoved: number;
  dryRun: boolean;
  removed: Array<{ id: string; title: string; url: string }>;
  retained: Array<{ id: string; title: string; reason: RetentionReason }>;
}

async function loadItems(client: SupabaseClient, windowDays: number, limit: number): Promise<PurgeCandidateRow[]> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const { data, error } = await client
    .from("content_items")
    .select("id,title,summary,body_content,canonical_url,published_at")
    .gte("fetched_at", since)
    .order("fetched_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error("PURGE_LOAD_FAILED");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: (row.title as string) ?? "",
    summary: (row.summary as string | null) ?? null,
    bodyText: (row.body_content as string | null) ?? null,
    canonicalUrl: (row.canonical_url as string) ?? "",
    publishedAt: (row.published_at as string | null) ?? null,
  }));
}

/**
 * Reader-owned item ids. Read for the scanned window only -- the ids are used
 * as a protection filter, so a miss must be impossible for the rows in hand,
 * but ids outside the window are irrelevant.
 */
/**
 * PostgREST puts `in` filters in the GET query string, and a few hundred UUIDs
 * overflow the URL (the feed route hit the same limit). Chunked, so a full
 * scan of the table can be protected, not just a small window.
 */
const ID_CHUNK = 80;

async function loadProtectedIds(client: SupabaseClient, ids: string[]): Promise<{ saved: Set<string>; submitted: Set<string> }> {
  const saved = new Set<string>();
  const submitted = new Set<string>();
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const chunk = ids.slice(index, index + ID_CHUNK);
    const [{ data: savedRows, error: savedError }, { data: submissionRows, error: submissionError }] = await Promise.all([
      client.from("saved_items").select("content_item_id").in("content_item_id", chunk),
      client.from("user_submissions").select("content_item_id").in("content_item_id", chunk),
    ]);
    if (savedError || submissionError) throw new Error("PURGE_OWNERSHIP_READ_FAILED");
    for (const row of savedRows ?? []) saved.add(row.content_item_id as string);
    for (const row of submissionRows ?? []) if (row.content_item_id) submitted.add(row.content_item_id as string);
  }
  return { saved, submitted };
}

export async function runLanguagePurge(
  client: SupabaseClient,
  options: LanguagePurgeOptions = {},
): Promise<LanguagePurgeReport> {
  const windowDays = options.windowDays ?? DEFAULT_PURGE_WINDOW_DAYS;
  const limit = options.limit ?? DEFAULT_PURGE_LIMIT;
  const dryRun = options.dryRun ?? true;

  const items = await loadItems(client, windowDays, limit);
  const protectedIds = await loadProtectedIds(client, items.map((item) => item.id));
  const plan = planLanguagePurge(items, protectedIds.saved, protectedIds.submitted);

  const report: LanguagePurgeReport = {
    scanned: items.length,
    flagged: plan.remove.length + plan.retained.length,
    itemsRemoved: plan.remove.length,
    dryRun,
    removed: plan.remove.map((item) => ({ id: item.id, title: item.title, url: item.canonicalUrl })),
    retained: plan.retained.map(({ item, reason }) => ({ id: item.id, title: item.title, reason })),
  };
  if (dryRun || !plan.remove.length) {
    if (dryRun) report.itemsRemoved = plan.remove.length;
    return report;
  }

  const removeIds = plan.remove.map((item) => item.id);
  for (let index = 0; index < removeIds.length; index += ID_CHUNK) {
    const { error } = await client.from("content_items").delete().in("id", removeIds.slice(index, index + ID_CHUNK));
    if (error) throw new Error("PURGE_DELETE_FAILED");
  }
  return report;
}
