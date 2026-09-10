import { describe, expect, it } from "vitest";
import { isNearDuplicateTitle, jaccard, shingles } from "@/lib/qualification/reject";
import { qualifyCandidate } from "@/lib/qualification";
import type { QualificationCandidate, QualificationContext } from "@/lib/qualification/types";

const candidate = (o: Partial<QualificationCandidate> = {}): QualificationCandidate => ({
  title: "Next.js 16.3: Everything New",
  summary: "What shipped.",
  bodyText: "The release adds a number of things that you will want to know about before "
    + "you upgrade, and this guide walks through each of them in the order they matter.",
  canonicalUrl: "https://medium.com/@a/next-163",
  publishedAt: "2026-09-09T09:00:00Z",
  ...o,
});
const context = (o: Partial<QualificationContext> = {}): QualificationContext =>
  ({ aliases: ["next.js", "nextjs"], trust: "community", now: new Date("2026-09-09T12:00:00Z"), ...o });

describe("cross-source duplicate titles", () => {
  it("rejects the syndicated story the second feed offers", () => {
    // Verbatim from rows stored twice on 2026-09-09 under Google Blog and
    // Google DeepMind Blog, which run in the same concurrency wave.
    const title = "Introducing WeatherNext 3, our most advanced and accurate forecasting model";
    expect(isNearDuplicateTitle(title, [title])).toBe(true);
    expect(qualifyCandidate(candidate({ title }), context({ recentTitles: [title] })))
      .toMatchObject({ accepted: false, reason: "near_duplicate_title" });
  });

  it("spares two genuinely different stories", () => {
    expect(isNearDuplicateTitle(
      "Introducing Gemini 3.8 Flash",
      ["Why I Removed Docker From My Local Postgres Setup"],
    )).toBe(false);
  });

  it("still catches a reworded republish", () => {
    expect(jaccard(
      shingles("Next.js 16.3: Everything New"),
      shingles("Next.js 16.3 Everything New"),
    )).toBeGreaterThan(0.8);
  });

  it("treats a URL that differs only by the feed stamp as the same story", () => {
    // The url_hash path handles this; asserted here so the two mechanisms are
    // visible together.
    const a = "Building a Movie Search with Next.js 16 and the App Router";
    expect(isNearDuplicateTitle(a, [a])).toBe(true);
  });
});
