import { describe, expect, it } from "vitest";
import { interestScore, recencyScore, trendingScore } from "./ranking";
import { demoItems } from "./demo-data";

describe("ranking", () => {
  it("gives unknown dates no recency", () => expect(recencyScore(null)).toBe(0));
  it("calculates matching interest proportion", () => {
    expect(interestScore(["Data Science", "Programming"], ["Programming"])).toBe(0.5);
  });
  it("excludes unknown dates from trending with a negative score", () => {
    expect(trendingScore(demoItems[3])).toBe(-1);
  });
});
