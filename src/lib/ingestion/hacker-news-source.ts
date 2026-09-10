import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscoveryAdapter, DiscoveryHit } from "@/lib/ingestion/discovery";
import { runDiscoverySource } from "@/lib/ingestion/discovery";
import { fetchDiscoveryJson } from "@/lib/ingestion/discovery-fetch";
import { candidateFromHnHit, hnComments, hnEngagement, hnSearchUrl, type HnHit } from "@/lib/ingestion/hacker-news";
import type { IngestionSource, InterestRow, SourceResult } from "@/lib/ingestion/types";

const MAX_CANDIDATES_PER_SOURCE = 20;
const DEFAULT_MIN_POINTS = 15;

async function fetchHits(source: IngestionSource): Promise<DiscoveryHit[]> {
  // discovery_query is what this source searches for. Without one there is
  // nothing to ask HN, and defaulting to the front page would attach whatever
  // is popular today to this source's topic.
  const query = source.discovery_query?.trim();
  if (!query) throw new Error("MISSING_DISCOVERY_QUERY");

  const parsed = await fetchDiscoveryJson<{ hits?: HnHit[] }>(
    hnSearchUrl(query, source.min_engagement ?? DEFAULT_MIN_POINTS, MAX_CANDIDATES_PER_SOURCE),
  );

  return (parsed.hits ?? []).flatMap((hit) => {
    const candidate = candidateFromHnHit(hit);
    if (!candidate) return [];
    return [
      {
        candidate,
        // Scored on points, the number the scorer normalises against HN's
        // scale. Comments are a second, independent reaction, so the stored
        // signal counts both -- Trending reads one number.
        engagementCount: hnEngagement(hit),
        signalCount: hnEngagement(hit) + hnComments(hit),
      },
    ];
  });
}

export const hackerNewsAdapter: DiscoveryAdapter = {
  platform: "hacker_news",
  fetchHits,
  // HN gives a link and a score, never the article, so everything new needs the
  // page fetched before it can be judged on substance.
  enrichFromPage: true,
};

export async function ingestHackerNewsSource(
  supabase: SupabaseClient,
  source: IngestionSource,
  interests: InterestRow[],
): Promise<SourceResult> {
  return runDiscoverySource(supabase, source, interests, hackerNewsAdapter);
}
