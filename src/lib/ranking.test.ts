import { describe, expect, it } from "vitest";
import { forYouScore, interestScore, rankItems, recencyScore, trendingScore } from "./ranking";
import { demoItems } from "./demo-data";
import type { FeedItem, TrustTier } from "./types";

const NOW = new Date("2026-09-09T12:00:00Z");

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "item-1",
    title: "A post about React",
    excerpt: "…",
    url: "https://example.com/a",
    source: "Example",
    author: null,
    publishedAt: "2026-09-09T00:00:00Z",
    interests: ["React"],
    sourceCount: 1,
    saved: false,
    read: false,
    explanation: [],
    ...overrides,
  };
}

describe("ranking", () => {
  it("gives unknown dates no recency", () => expect(recencyScore(null)).toBe(0));
  it("calculates matching interest proportion", () => {
    expect(interestScore(["TypeScript", "React"], ["React"])).toBe(0.5);
  });
  it("excludes unknown dates from trending with a negative score", () => {
    expect(trendingScore(demoItems[3])).toBe(-1);
  });
  it("uses learned interest affinity to personalize the For You order", () => {
    const ranked = rankItems(demoItems.slice(0, 3), "for-you", [], {
      OpenAI: 20,
      "Next.js": -5,
    });
    expect(ranked[0].interests).toContain("OpenAI");
  });
});

describe("source trust", () => {
  it("treats an item with no trust as official", () => {
    expect(forYouScore(item(), ["React"], NOW)).toBe(forYouScore(item({ trust: "official" }), ["React"], NOW));
  });

  it("ranks an official post above an identical community one in For You", () => {
    const official = item({ id: "same-id", trust: "official" });
    const community = item({ id: "same-id", trust: "community" });
    // Same id keeps the exploration term equal, so trust is the only difference.
    expect(forYouScore(official, ["React"], NOW)).toBeGreaterThan(forYouScore(community, ["React"], NOW));
  });

  it("ranks an official post above an identical community one in Trending", () => {
    expect(trendingScore(item({ trust: "official" }), NOW)).toBeGreaterThan(
      trendingScore(item({ trust: "community" }), NOW),
    );
  });

  it("demotes progressively down the tiers", () => {
    const tiers: TrustTier[] = ["official", "community", "probationary", "unknown"];
    const scores = tiers.map((trust) => forYouScore(item({ id: "same-id", trust }), ["React"], NOW));
    expect(scores).toStrictEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(tiers.length);
  });

  it("leaves Latest as a pure date sort regardless of trust", () => {
    const older = item({ id: "older", trust: "official", publishedAt: "2026-09-01T00:00:00Z" });
    const newer = item({ id: "newer", trust: "unknown", publishedAt: "2026-09-08T00:00:00Z" });
    expect(rankItems([older, newer], "latest", []).map((entry) => entry.id)).toStrictEqual(["newer", "older"]);
  });
});
