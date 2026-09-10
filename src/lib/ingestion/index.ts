import type { SupabaseClient } from "@supabase/supabase-js";
import { devToAdapter } from "@/lib/ingestion/dev-to-source";
import { runDiscoverySource, type DiscoveryAdapter } from "@/lib/ingestion/discovery";
import { githubReleasesAdapter } from "@/lib/ingestion/github-releases-source";
import { hackerNewsAdapter } from "@/lib/ingestion/hacker-news-source";
import { ingestGenericRssSource } from "@/lib/ingestion/generic-rss";
import { ingestMediumSource } from "@/lib/ingestion/medium";
import { stackExchangeAdapter } from "@/lib/ingestion/stack-exchange-source";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
import { youtubeAdapter } from "@/lib/ingestion/youtube-source";

/**
 * Every discovery platform behind one interface, and one shared pipeline that
 * runs them. Adding a platform is a mapping module plus a row here; adding a
 * source of an existing platform is a database row alone.
 */
const DISCOVERY_ADAPTERS: Record<string, DiscoveryAdapter> = {
  hacker_news: hackerNewsAdapter,
  dev_to: devToAdapter,
  stack_exchange: stackExchangeAdapter,
  github_releases: githubReleasesAdapter,
  youtube: youtubeAdapter,
};

export async function ingestSource(client: SupabaseClient, source: IngestionSource, interests: InterestRow[]): Promise<SourceResult> {
  const discovery = DISCOVERY_ADAPTERS[source.source_type];
  if (discovery) return runDiscoverySource(client, source, interests, discovery);
  if (source.source_type === "medium_rss") return ingestMediumSource(client, source, interests);
  if (source.source_type === "rss") return ingestGenericRssSource(client, source, interests);
  return { sourceId: source.id, fetched: 0, inserted: 0, duplicates: 0, rejected: 0, status: "failed", errorCode: "UNSUPPORTED_SOURCE_TYPE" };
}

export type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";
