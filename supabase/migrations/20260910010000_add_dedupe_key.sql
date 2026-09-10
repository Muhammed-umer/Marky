--------------------------------------------------------------------------------
-- CONTENT_ITEMS.DEDUPE_KEY
--------------------------------------------------------------------------------
-- url_hash is computed by the application at insert time, so it records
-- whatever the canonicalisation rules were on the day a row arrived. Two things
-- follow from that, and both have now been observed live:
--
--   1. When canonicalizeUrl learns a rule -- as it did for Medium's per-feed
--      "?source=rss----<tag>" stamp -- every row stored earlier keeps its old
--      hash and stays a duplicate.
--   2. Worse, once old rows are rewritten to the new form, an application
--      still running the old rules no longer matches them: it looks up the
--      stamped hash, finds nothing, and inserts a second copy. On 2026-09-10
--      "Building PullWard AI..." was stored twice for exactly this reason --
--      same Medium post id, same author, one URL stamped and one clean.
--
-- The fix is to stop trusting the application to normalise. dedupe_key is
-- derived by the database from canonical_url, so every writer -- old code, new
-- code, the submission worker, a future adapter -- collapses onto the same key
-- whether it knows the rule or not. The unique index then makes a duplicate
-- insert fail with 23505, which the adapters already handle by treating the
-- row as an existing item.
--
-- The expression removes the stamp and any separator it leaves behind, so a
-- stamped URL and a clean one produce the same key even when other query
-- parameters are present. Verified against these cases:
--   p?source=rss------github-5   -> p
--   p?source=rss-x&foo=1         -> p?foo=1
--   p?foo=1&source=rss-x         -> p?foo=1
--   p?source=newsletter          -> p?source=newsletter   (left alone)
--------------------------------------------------------------------------------

-- 1. Collapse existing duplicates before the unique index can be created.
--    Keeps the richest row (image, then body), oldest breaking the tie, and
--    re-points saved_items first -- that foreign key is ON DELETE CASCADE and
--    would otherwise take a reader's saved article with it.
WITH normalized AS (
  SELECT
    id,
    image_url,
    body_content,
    fetched_at,
    regexp_replace(
      regexp_replace(canonical_url, '([?&])source=rss[^&]*(&|$)', '\1', 'g'),
      '[?&]+$', ''
    ) AS key
  FROM public.content_items
),
ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY key
      ORDER BY
        (CASE WHEN image_url IS NOT NULL THEN 2 ELSE 0 END
         + CASE WHEN body_content IS NOT NULL THEN 1 ELSE 0 END) DESC,
        fetched_at ASC
    ) AS keeper_id
  FROM normalized
)
UPDATE public.saved_items s
SET content_item_id = r.keeper_id
FROM ranked r
WHERE s.content_item_id = r.id
  AND r.keeper_id <> r.id
  -- Skip when the reader already has the keeper saved; the delete below then
  -- removes the redundant row through the cascade, which is correct.
  AND NOT EXISTS (
    SELECT 1 FROM public.saved_items existing
    WHERE existing.user_id = s.user_id AND existing.content_item_id = r.keeper_id
  );

WITH normalized AS (
  SELECT
    id,
    image_url,
    body_content,
    fetched_at,
    regexp_replace(
      regexp_replace(canonical_url, '([?&])source=rss[^&]*(&|$)', '\1', 'g'),
      '[?&]+$', ''
    ) AS key
  FROM public.content_items
),
ranked AS (
  SELECT
    id,
    first_value(id) OVER (
      PARTITION BY key
      ORDER BY
        (CASE WHEN image_url IS NOT NULL THEN 2 ELSE 0 END
         + CASE WHEN body_content IS NOT NULL THEN 1 ELSE 0 END) DESC,
        fetched_at ASC
    ) AS keeper_id
  FROM normalized
)
DELETE FROM public.content_items c
USING ranked r
WHERE c.id = r.id AND r.keeper_id <> r.id;

-- 2. The derived key. regexp_replace is IMMUTABLE, so it can back a generated
--    column.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT GENERATED ALWAYS AS (
    regexp_replace(
      regexp_replace(canonical_url, '([?&])source=rss[^&]*(&|$)', '\1', 'g'),
      '[?&]+$', ''
    )
  ) STORED;

-- 3. One row per article, enforced by the database rather than by whichever
--    application version happens to be deployed.
CREATE UNIQUE INDEX IF NOT EXISTS content_items_dedupe_key_idx
  ON public.content_items (dedupe_key);

DO $$
DECLARE
  dupes INTEGER;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT dedupe_key FROM public.content_items GROUP BY dedupe_key HAVING count(*) > 1
  ) AS d;
  IF dupes > 0 THEN
    RAISE EXCEPTION 'dedupe_key still has % duplicate group(s)', dupes;
  END IF;
END $$;
