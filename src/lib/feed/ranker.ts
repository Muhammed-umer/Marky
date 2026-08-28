import { ContentItem, FeedItem } from "@/types/database";
import { DEFAULT_FEED_CONFIG, FeedScoringConfig } from "./config";

/**
 * Calculates exponential recency score based on hours elapsed since published_at (48h half-life).
 */
export function calculateRecencyScore(publishedAtStr: string | null, halfLifeHours = 48): number {
  if (!publishedAtStr) {
    // If published_at timestamp is unavailable, record fallback baseline score (0.1)
    return 0.1;
  }

  try {
    const publishedAt = new Date(publishedAtStr).getTime();
    const now = Date.now();
    const hoursElapsed = Math.max(0, (now - publishedAt) / (1000 * 60 * 60));

    // Half-life exponential decay formula: 2 ^ (-hours / halfLife)
    return Math.pow(2, -hoursElapsed / halfLifeHours);
  } catch {
    return 0.1;
  }
}

/**
 * Ranks and scores content items for a specific user based on interest matches and content recency.
 */
export function scoreFeedItems(
  items: ContentItem[],
  userInterestIds: string[],
  itemInterestMap: Record<string, string[]>,
  config: FeedScoringConfig = DEFAULT_FEED_CONFIG
): FeedItem[] {
  const userInterestSet = new Set(userInterestIds);

  return items.map((item) => {
    const itemTopicIds = itemInterestMap[item.id] || [];
    const hasMatchingTopic = itemTopicIds.some((id) => userInterestSet.has(id));

    // Interest relevance score: 1.0 if matching topic exists, 0.2 baseline
    const interestScore = hasMatchingTopic ? 1.0 : 0.2;

    // Recency score strictly derived from original published_at
    const recencyScore = calculateRecencyScore(item.published_at, config.recencyHalfLifeHours);

    // Total score = (w_interest * interestScore) + (w_recency * recencyScore)
    const score = config.weightInterest * interestScore + config.weightRecency * recencyScore;

    return {
      ...item,
      score: Math.round(score * 1000) / 1000,
    };
  });
}
