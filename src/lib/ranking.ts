import type { FeedItem, Interest, TrustTier } from "@/lib/types";

const HALF_LIFE_HOURS = 48;

/**
 * Applied to the finished score rather than added as a seventh weighted term:
 * the For You weights already sum to exactly 1, so a new term would mean
 * renormalising all six and shifting every existing score.
 *
 * The qualification gate already decides whether a community item is good
 * enough to store at all. This is the softer, second question of how it should
 * sit next to an official post that cleared the same bar, so the spread is
 * deliberately gentler than the gate's trust factor.
 */
const TRUST_MULTIPLIER: Record<TrustTier, number> = {
  official: 1,
  community: 0.85,
  probationary: 0.7,
  unknown: 0.6,
};

function trustMultiplier(item: FeedItem) {
  return TRUST_MULTIPLIER[item.trust ?? "official"];
}
export type InterestAffinity = Partial<Record<Interest, number>>;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function engagementScore(count = 0) {
  return clamp01(Math.log10(count + 1) / 5);
}

function learnedAffinityScore(itemInterests: Interest[], affinity: InterestAffinity) {
  if (!itemInterests.length) return 0;
  const total = itemInterests.reduce((sum, itemInterest) => sum + clamp01(((affinity[itemInterest] ?? 0) + 5) / 25), 0);
  return total / itemInterests.length;
}

function explorationScore(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  return (hash % 1000) / 1000;
}

export function recencyScore(publishedAt: string | null, now = new Date()): number {
  if (!publishedAt) return 0;
  const ageHours = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000);
  return 2 ** (-ageHours / HALF_LIFE_HOURS);
}

export function interestScore(itemInterests: Interest[], selected: Interest[]): number {
  if (!itemInterests.length || !selected.length) return 0;
  return itemInterests.filter((interest) => selected.includes(interest)).length / itemInterests.length;
}

export function forYouScore(item: FeedItem, selected: Interest[], now = new Date(), affinity: InterestAffinity = {}): number {
  const learned = learnedAffinityScore(item.interests, affinity);
  const diversity = Math.min(item.sourceCount / 5, 1);
  const base = 0.38 * learned
    + 0.22 * interestScore(item.interests, selected)
    + 0.2 * recencyScore(item.publishedAt, now)
    + 0.12 * engagementScore(item.engagementCount)
    + 0.06 * diversity
    + 0.02 * explorationScore(item.id);
  return base * trustMultiplier(item);
}

export function trendingScore(item: FeedItem, now = new Date()): number {
  if (!item.publishedAt) return -1;
  const diversity = Math.min(item.sourceCount / 5, 1);
  const relevance = Math.min(item.interests.length / 3, 1);
  const engagement = engagementScore(item.engagementCount);
  const base = 0.4 * recencyScore(item.publishedAt, now) + 0.35 * engagement + 0.15 * diversity + 0.1 * relevance;
  return base * trustMultiplier(item);
}

export function rankItems(items: FeedItem[], view: "for-you" | "trending" | "latest", selected: Interest[], affinity: InterestAffinity = {}) {
  const copy = items.map((item) => ({ ...item }));
  if (view === "for-you") return copy.sort((a, b) => forYouScore(b, selected, new Date(), affinity) - forYouScore(a, selected, new Date(), affinity));
  if (view === "trending") return copy.filter((item) => item.publishedAt).sort((a, b) => trendingScore(b) - trendingScore(a));
  // Latest is a pure date sort and stays one: trust-weighting it would make it
  // silently not-latest. Community items are already gated before storage.
  return copy.sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}
