import { isLikelyNonEnglish } from "@/lib/qualification/reject";

/**
 * Selects stored `content_items` that the language gate would reject today.
 *
 * The gate in `qualification/reject.ts` decides this at ingest, but it only
 * started running on 2026-09-09; rows stored before that -- and rows from any
 * path that predates it -- are still in the table. This module finds them so
 * they can be removed.
 *
 * It deliberately calls `isLikelyNonEnglish` rather than re-deriving the rule.
 * One definition of "English enough to show" is the point: if cleanup and
 * prevention could disagree, a purge would delete rows the very next ingestion
 * run would happily store again.
 */

export interface PurgeCandidateRow {
  id: string;
  title: string;
  summary: string | null;
  bodyText: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
}

/**
 * Why a non-English row is kept anyway.
 *
 * Both reasons are the same principle: the language gate exists to filter what
 * Marky *chose* to discover, not to overrule what a reader chose for
 * themselves. A reader who submits a Marathi article, or saves one, has made a
 * deliberate decision about their own library, and AGENTS.md guarantees saved
 * items survive. Deleting those rows would honour a feed-quality rule by
 * breaking a user-facing promise.
 */
export type RetentionReason = "saved_by_reader" | "reader_submission";

export interface RetainedRow {
  item: PurgeCandidateRow;
  reason: RetentionReason;
}

export interface PurgePlan {
  /** Rows safe to delete. */
  remove: PurgeCandidateRow[];
  /** Non-English rows kept because a reader owns them. */
  retained: RetainedRow[];
}

/**
 * Splits the flagged rows into "delete" and "kept, because a reader owns it".
 *
 * Ownership is checked before deletion rather than relying on the foreign keys:
 * `saved_items.content_item_id` is ON DELETE CASCADE, so a delete here would
 * take the reader's saved row with it silently, and
 * `user_submissions.content_item_id` is ON DELETE SET NULL, which would leave a
 * completed submission pointing at nothing.
 */
export function planLanguagePurge(
  items: PurgeCandidateRow[],
  savedItemIds: ReadonlySet<string>,
  submittedItemIds: ReadonlySet<string>,
): PurgePlan {
  const plan: PurgePlan = { remove: [], retained: [] };
  for (const item of items) {
    if (!isLikelyNonEnglish({
      title: item.title,
      summary: item.summary,
      bodyText: item.bodyText,
      canonicalUrl: item.canonicalUrl,
      publishedAt: item.publishedAt,
    })) continue;

    if (submittedItemIds.has(item.id)) plan.retained.push({ item, reason: "reader_submission" });
    else if (savedItemIds.has(item.id)) plan.retained.push({ item, reason: "saved_by_reader" });
    else plan.remove.push(item);
  }
  return plan;
}
