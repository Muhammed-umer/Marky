import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestGenericRssSource } from "@/lib/ingestion/generic-rss";
import { ingestMediumSource } from "@/lib/ingestion/medium";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";

export async function ingestSource(client: SupabaseClient, source: IngestionSource, interests: InterestRow[]): Promise<SourceResult> {
  if (source.source_type === "medium_rss") return ingestMediumSource(client, source, interests);
  if (source.source_type === "rss") return ingestGenericRssSource(client, source, interests);
  return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, status: "failed", errorCode: "UNSUPPORTED_SOURCE_TYPE" };
}

export type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
