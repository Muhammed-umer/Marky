import "server-only";
import type { DiscoveryAdapter, DiscoveryHit } from "@/lib/ingestion/discovery";
import { fetchDiscoveryJson } from "@/lib/ingestion/discovery-fetch";
import {
  candidateFromStackExchangeQuestion,
  isValidStackExchangeSite,
  stackExchangeEngagement,
  stackExchangeSearchUrl,
  stackExchangeSiteFromUrl,
  type StackExchangeResponse,
} from "@/lib/ingestion/stack-exchange";
import type { IngestionSource } from "@/lib/ingestion/types";

const PAGE_SIZE = 25;
const DEFAULT_MIN_SCORE = 5;
const WINDOW_DAYS = 30;

/**
 * A question is only a story once somebody has answered it well, so the floor
 * here is a vote score rather than a reaction count, and unanswered questions
 * are excluded by the query itself.
 */
async function fetchHits(source: IngestionSource): Promise<DiscoveryHit[]> {
  const tag = source.discovery_query?.trim().toLowerCase();
  if (!tag) throw new Error("MISSING_DISCOVERY_QUERY");

  // The site slug lives in site_url so no column had to be added for it.
  const site = stackExchangeSiteFromUrl(source.site_url);
  if (!site || !isValidStackExchangeSite(site)) throw new Error("INVALID_STACK_EXCHANGE_SITE");

  const minScore = source.min_engagement ?? DEFAULT_MIN_SCORE;
  const fromDate = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const response = await fetchDiscoveryJson<StackExchangeResponse>(
    stackExchangeSearchUrl(site, tag, minScore, PAGE_SIZE, fromDate),
  );

  // The API answers a spent quota with a normal 200 and backoff instructions,
  // so the ledger is not the only thing that can stop a run.
  if (response.backoff) throw new Error("BACKOFF_REQUESTED");

  return (response.items ?? []).flatMap((question) => {
    if (!question.is_answered) return [];
    const candidate = candidateFromStackExchangeQuestion(question);
    return candidate ? [{ candidate, engagementCount: stackExchangeEngagement(question) }] : [];
  });
}

export const stackExchangeAdapter: DiscoveryAdapter = {
  platform: "stack_exchange",
  fetchHits,
  // `withbody` returns the question body, and fetching the page would only
  // re-extract what the API already gave us.
  enrichFromPage: false,
  // 300 requests per IP per day unauthenticated, shared across every site.
  quota: "stack_exchange",
};
