--------------------------------------------------------------------------------
-- CONTENT_ITEMS.WORD_COUNT
--------------------------------------------------------------------------------
-- The reader shows "N min read". Until now that number was derived from the
-- length of the title plus the summary, which is not a measurement of anything.
-- With body text now stored at ingest, the count can be real.
--
-- A generated column rather than an application write: it is correct for rows
-- the backfill re-extracts, for the submission worker, and for both ingestion
-- adapters without any of them having to remember to set it. NULL when there is
-- no body, so the UI can omit the figure instead of guessing.
ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS word_count INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN body_content IS NULL OR btrim(body_content) = '' THEN NULL
      ELSE array_length(regexp_split_to_array(btrim(body_content), '\s+'), 1)
    END
  ) STORED;
