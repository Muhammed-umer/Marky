import { describe, expect, it } from "vitest";
import { keyPoints, splitSentences } from "@/lib/summarize";

const ARTICLE = [
  "GitHub availability report for August 2026 is here.",
  "In August we experienced five incidents that resulted in degraded performance across GitHub services.",
  "Press enter or click to view image in full size18 min read2 hours ago",
  "We are aggressively investing in architectural improvements and moving to Azure, which will give us more capacity.",
  "On August 11, GitHub ran a production MySQL primary from Azure for the first time.",
  "Read traffic reached new highs, with reads from migrated services peaking at 69.4 percent.",
  "Ok.",
  "The post GitHub availability report: August 2026 appeared first on The GitHub Blog.",
].join(" ");

describe("splitSentences", () => {
  it("splits on ordinary punctuation", () => {
    expect(splitSentences("One thing happened. Then another did.")).toHaveLength(2);
  });

  it("splits where extraction lost the space after punctuation", () => {
    // Readability joins a heading to the paragraph below it.
    const parts = splitSentences("Who verified the claim, and how?In October 2025 someone did.");
    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe("In October 2025 someone did.");
  });

  it("does not split an abbreviation mid-sentence", () => {
    expect(splitSentences("We shipped it in the U.S. and it worked.")).toHaveLength(1);
  });
});

describe("keyPoints", () => {
  it("returns nothing when there is no body rather than inventing a summary", () => {
    expect(keyPoints(null)).toEqual([]);
    expect(keyPoints("")).toEqual([]);
  });

  it("only ever returns sentences the article actually contains", () => {
    // The whole point of extracting rather than generating: every line can be
    // found verbatim in the source.
    const flat = ARTICLE.replace(/\s+/g, " ");
    for (const point of keyPoints(ARTICLE, { aliases: ["github"], max: 4 })) {
      expect(flat).toContain(point);
    }
  });

  it("drops reader chrome that extraction swept up", () => {
    const points = keyPoints(ARTICLE, { aliases: ["github"], max: 5 });
    expect(points.join(" ")).not.toContain("Press enter or click");
    expect(points.join(" ")).not.toContain("min read");
  });

  it("drops the feed boilerplate trailer", () => {
    expect(keyPoints(ARTICLE, { max: 6 }).join(" ")).not.toContain("appeared first on");
  });

  it("skips fragments too short to carry a point", () => {
    expect(keyPoints(ARTICLE, { max: 8 }).join(" ")).not.toContain("Ok.");
  });

  it("keeps the article's own order so it still reads as an argument", () => {
    const points = keyPoints(ARTICLE, { aliases: ["github"], max: 3 });
    const positions = points.map((p) => ARTICLE.indexOf(p));
    expect(positions).toStrictEqual([...positions].sort((a, b) => a - b));
  });

  it("honours the requested count and clamps it", () => {
    expect(keyPoints(ARTICLE, { max: 2 })).toHaveLength(2);
    expect(keyPoints(ARTICLE, { max: 99 }).length).toBeLessThanOrEqual(8);
  });

  it("is deterministic", () => {
    expect(keyPoints(ARTICLE, { aliases: ["github"] })).toStrictEqual(keyPoints(ARTICLE, { aliases: ["github"] }));
  });
});
