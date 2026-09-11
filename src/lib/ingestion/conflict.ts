import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Finds the row an insert collided with (Postgres 23505).
 *
 * Two unique indexes can raise that: `url_hash`, and `dedupe_key`, which the
 * database derives from `canonical_url` (migration 20260910010000). A row
 * stored before `canonicalizeUrl` learned a rule -- Medium's
 * `?source=rss----<tag>` stamp -- still carries its old hash, so the hash
 * lookup misses it while its `dedupe_key` equals the clean URL the adapter now
 * computes. Looking the row up both ways is what turns that collision into
 * "already stored" instead of a failed run for every feed still carrying the
 * post.
 *
 * When the match came through `dedupe_key`, the row is rewritten to the current
 * canonical form so the next run finds it by hash in the batch lookup and never
 * attempts the insert again. That rewrite is best effort: if it fails the old
 * form stays, which costs one more collision next run and nothing else.
 *
 * Returns undefined when neither lookup finds a row, which callers treat as
 * "skip this item" rather than as a run failure -- the collision itself proves
 * the article is stored.
 */
export async function resolveConflictingItem(
  client: SupabaseClient,
  hash: string,
  canonicalUrl: string,
): Promise<string | undefined> {
  const { data: byHash } = await client.from("content_items").select("id").eq("url_hash", hash).maybeSingle();
  if (byHash?.id) return byHash.id as string;

  const { data: byKey } = await client.from("content_items").select("id").eq("dedupe_key", canonicalUrl).maybeSingle();
  if (!byKey?.id) return undefined;

  const id = byKey.id as string;
  await client
    .from("content_items")
    .update({ canonical_url: canonicalUrl, url_hash: hash, updated_at: new Date().toISOString() })
    .eq("id", id);
  return id;
}
