import "server-only";
import { candidateFromDevToArticle, devToEngagement, devToSearchUrl, isValidDevToTag, type DevToArticle } from "@/lib/ingestion/dev-to";
import type { DiscoveryAdapter, DiscoveryHit } from "@/lib/ingestion/discovery";
import { fetchDiscoveryJson } from "@/lib/ingestion/discovery-fetch";
import type { IngestionSource } from "@/lib/ingestion/types";

const PER_PAGE = 30;
const TOP_WINDOW_DAYS = 30;
const DEFAULT_MIN_REACTIONS = 25;

/**
 * DEV.to returns the whole tag firehose sorted by reactions, with no
 * server-side floor, so the floor is applied here. `min_engagement` tunes it
 * per source without a deploy, as it does for Hacker News.
 */
async function fetchHits(source: IngestionSource): Promise<DiscoveryHit[]> {
  const tag = source.discovery_query?.trim().toLowerCase();
  if (!tag) throw new Error("MISSING_DISCOVERY_QUERY");
  // An unrecognised tag returns the global firehose rather than an error, which
  // would attach arbitrary posts to this source's topic.
  if (!isValidDevToTag(tag)) throw new Error("INVALID_DEV_TO_TAG");

  const floor = source.min_engagement ?? DEFAULT_MIN_REACTIONS;
  const articles = await fetchDiscoveryJson<DevToArticle[]>(devToSearchUrl(tag, TOP_WINDOW_DAYS, PER_PAGE));
  if (!Array.isArray(articles)) throw new Error("UNEXPECTED_RESPONSE_SHAPE");

  return articles.flatMap((article) => {
    const engagementCount = devToEngagement(article);
    if (engagementCount < floor) return [];
    const candidate = candidateFromDevToArticle(article);
    return candidate ? [{ candidate, engagementCount }] : [];
  });
}

export const devToAdapter: DiscoveryAdapter = {
  platform: "dev_to",
  fetchHits,
  // The list endpoint returns a description, never the post body, and the
  // substance floor is measured in words.
  enrichFromPage: true,
};
