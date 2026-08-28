import type { FeedItem, Interest } from "@/lib/types";

const HALF_LIFE_HOURS = 48;

export function recencyScore(publishedAt: string | null, now = new Date()): number {
  if (!publishedAt) return 0;
  const ageHours = Math.max(0, (now.getTime() - new Date(publishedAt).getTime()) / 3_600_000);
  return 2 ** (-ageHours / HALF_LIFE_HOURS);
}

export function interestScore(itemInterests: Interest[], selected: Interest[]): number {
  if (!itemInterests.length || !selected.length) return 0;
  return itemInterests.filter((interest) => selected.includes(interest)).length / itemInterests.length;
}

export function forYouScore(item: FeedItem, selected: Interest[], now = new Date()): number {
  return 0.65 * interestScore(item.interests, selected) + 0.35 * recencyScore(item.publishedAt, now);
}

export function trendingScore(item: FeedItem, now = new Date()): number {
  if (!item.publishedAt) return -1;
  const diversity = Math.min(item.sourceCount / 5, 1);
  const relevance = Math.min(item.interests.length / 3, 1);
  return 0.5 * recencyScore(item.publishedAt, now) + 0.3 * diversity + 0.2 * relevance;
}

export function rankItems(items: FeedItem[], view: "for-you" | "trending" | "latest", selected: Interest[]) {
  const copy = items.map((item) => ({ ...item }));
  if (view === "for-you") return copy.sort((a, b) => forYouScore(b, selected) - forYouScore(a, selected));
  if (view === "trending") return copy.filter((item) => item.publishedAt).sort((a, b) => trendingScore(b) - trendingScore(a));
  return copy.sort((a, b) => {
    if (!a.publishedAt) return 1;
    if (!b.publishedAt) return -1;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });
}
