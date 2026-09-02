import { describe, expect, it } from "vitest";
import { interestScore, rankItems, recencyScore, trendingScore } from "./ranking";
import { demoItems } from "./demo-data";

describe("ranking", () => {
  it("gives unknown dates no recency", () => expect(recencyScore(null)).toBe(0));
  it("calculates matching interest proportion", () => {
    expect(interestScore(["Data Science", "Programming"], ["Programming"])).toBe(0.5);
  });
  it("excludes unknown dates from trending with a negative score", () => {
    expect(trendingScore(demoItems[3])).toBe(-1);
  });
  it("uses learned interest affinity to personalize the For You order", () => {
    const ranked = rankItems(demoItems.slice(0, 3), "for-you", [], {
      Cybersecurity: 20,
      "Artificial Intelligence": -5,
    });
    expect(ranked[0].interests).toContain("Cybersecurity");
  });
});
