import { describe, expect, it } from "vitest";
import { qualifyCandidate, QUALIFICATION_THRESHOLD, WEIGHTS } from "@/lib/qualification";
import { isNearDuplicateTitle, jaccard, shingles } from "@/lib/qualification/reject";
import { engagementScore, relevanceScore, scoreCandidate, substanceScore, trustScore } from "@/lib/qualification/score";
import type { QualificationCandidate, QualificationContext } from "@/lib/qualification/types";

const NOW = new Date("2026-09-09T12:00:00Z");
const RECENT = "2026-09-09T09:00:00Z";

function candidate(overrides: Partial<QualificationCandidate> = {}): QualificationCandidate {
  return {
    title: "Next.js 16 introduces partial prerendering",
    summary: "A walkthrough of the new rendering mode.",
    bodyText: "word ".repeat(500).trim(),
    canonicalUrl: "https://nextjs.org/blog/next-16",
    publishedAt: RECENT,
    ...overrides,
  };
}

function context(overrides: Partial<QualificationContext> = {}): QualificationContext {
  return { aliases: ["next.js", "nextjs"], trust: "official", now: NOW, ...overrides };
}

describe("weights", () => {
  it("sum to 1", () => {
    const total = Object.values(WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("relevanceScore", () => {
  it("scores an alias in the title highest", () => {
    expect(relevanceScore(candidate(), ["next.js"])).toBe(1);
  });

  it("scores a lead-paragraph mention below a title mention", () => {
    const item = candidate({ title: "A rendering deep dive", summary: "How next.js handles it.", bodyText: null });
    expect(relevanceScore(item, ["next.js"])).toBe(0.7);
  });

  it("scores a tail-only mention lowest", () => {
    const item = candidate({
      title: "A rendering deep dive",
      summary: null,
      bodyText: `${"filler ".repeat(400)} next.js appears only at the end`,
    });
    expect(relevanceScore(item, ["next.js"])).toBe(0.3);
  });

  it("returns zero when no alias appears anywhere", () => {
    expect(relevanceScore(candidate({ title: "Unrelated", summary: null, bodyText: "nothing here" }), ["next.js"])).toBe(0);
  });
});

describe("substanceScore", () => {
  it("treats a long article as substantial", () => {
    expect(substanceScore(candidate())).toBe(1);
  });

  it("treats a short post containing code as substantial", () => {
    expect(substanceScore(candidate({ bodyText: "Run npm install marky to begin." }))).toBe(1);
  });

  it("treats a release as substantial regardless of length", () => {
    expect(substanceScore(candidate({ bodyText: "v2.1.0", kind: "release" }))).toBe(1);
  });

  it("scores a medium post at a half and a stub at zero", () => {
    expect(substanceScore(candidate({ bodyText: "word ".repeat(200).trim() }))).toBe(0.5);
    expect(substanceScore(candidate({ bodyText: "word ".repeat(20).trim(), summary: null }))).toBe(0);
  });
});

describe("engagementScore", () => {
  it("normalises comparable attention across platforms", () => {
    expect(engagementScore(50, "hacker_news")).toBeCloseTo(engagementScore(200, "reddit"), 1);
    expect(engagementScore(30, "dev_to")).toBeCloseTo(engagementScore(20, "stack_exchange"), 1);
  });

  it("is bounded and monotonic", () => {
    expect(engagementScore(0, "hacker_news")).toBe(0);
    expect(engagementScore(100_000, "hacker_news")).toBe(1);
    expect(engagementScore(80, "hacker_news")).toBeGreaterThan(engagementScore(10, "hacker_news"));
  });
});

describe("scoreCandidate", () => {
  it("redistributes the engagement weight when a source reports none", () => {
    const { breakdown, score } = scoreCandidate(candidate(), context());
    expect(breakdown.engagement).toBeNull();
    // relevance 1, trust 1, substance 1, freshness 2^(-3/48) over weights summing to 0.85
    expect(score).toBeGreaterThan(0.9);
  });

  it("still scores a reported zero as zero", () => {
    const { breakdown, score } = scoreCandidate(
      candidate({ engagementCount: 0, platform: "hacker_news" }),
      context(),
    );
    expect(breakdown.engagement).toBe(0);
    expect(score).toBeLessThan(0.9);
  });
});

describe("near-duplicate detection", () => {
  it("scores identical titles as fully overlapping", () => {
    expect(jaccard(shingles("a b c"), shingles("a b c"))).toBe(1);
  });

  it("catches a reworded republish and spares a different story", () => {
    const recent = ["OpenAI releases GPT-5 for developers today"];
    expect(isNearDuplicateTitle("OpenAI releases GPT-5 for developers today!", recent)).toBe(true);
    expect(isNearDuplicateTitle("Supabase adds branching to every project", recent)).toBe(false);
  });
});

describe("qualifyCandidate", () => {
  it("accepts a fresh, relevant, substantial post from an official source", () => {
    const result = qualifyCandidate(candidate(), context());
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("qualified");
    expect(result.score).toBeGreaterThanOrEqual(QUALIFICATION_THRESHOLD);
  });

  it("rejects the off-topic post that keyword matching on the source name let through", () => {
    // Real item stored under the Google topic because the source was named
    // "Google Blog" — the case this whole gate exists to catch.
    const result = qualifyCandidate(
      candidate({
        title: "Supporting independent journalism in Ukraine",
        summary: "How we are funding newsrooms.",
        bodyText: "word ".repeat(500).trim(),
        canonicalUrl: "https://blog.google/outreach-initiatives/journalism",
      }),
      context({ aliases: ["google", "deepmind", "gemini"] }),
    );
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe("no_topic_relevance");
  });

  it("rejects a duplicate before scoring it", () => {
    const result = qualifyCandidate(candidate(), context({ duplicate: true }));
    expect(result).toMatchObject({ accepted: false, reason: "duplicate_url_hash", score: 0 });
  });

  it("rejects aggregators, spam and stale articles", () => {
    expect(qualifyCandidate(candidate({ canonicalUrl: "https://news.ycombinator.com/item?id=1" }), context()).reason)
      .toBe("aggregator_domain");
    expect(qualifyCandidate(candidate({ summary: "This post is sponsored by a vendor." }), context()).reason)
      .toBe("spam_markers");
    expect(qualifyCandidate(candidate({ publishedAt: "2026-01-01T00:00:00Z" }), context()).reason)
      .toBe("stale");
  });

  it("keeps a stale release, which is still the canonical record of a version", () => {
    const result = qualifyCandidate(
      candidate({ publishedAt: "2026-01-01T00:00:00Z", kind: "release" }),
      context(),
    );
    expect(result.reason).not.toBe("stale");
  });

  it("rejects a thin post from an unknown source but keeps the reason specific", () => {
    const result = qualifyCandidate(
      candidate({ bodyText: "Too short to judge.", summary: null }),
      context({ trust: "unknown" }),
    );
    expect(result).toMatchObject({ accepted: false, reason: "thin_content" });
  });
});

describe("source trust", () => {
  it("scores each tier at its documented value", () => {
    expect(trustScore("official")).toBe(1);
    expect(trustScore("community")).toBe(0.7);
    expect(trustScore("probationary")).toBe(0.4);
    expect(trustScore("unknown")).toBe(0.2);
  });

  it("admits a strong Medium post despite the community tier", () => {
    // Title match, 500 words, published today: everything except trust is at
    // its maximum, which is what a community source has to manage.
    const result = qualifyCandidate(
      candidate({ canonicalUrl: "https://medium.com/@author/next-16-partial-prerendering" }),
      context({ trust: "community" }),
    );
    expect(result).toMatchObject({ accepted: true, reason: "qualified" });
  });

  it("rejects a middling post that only the official tier would have carried", () => {
    // No alias in the title (relevance 0.7, not 1), ~200 words (substance 0.5)
    // and eight days old (freshness 0.0625). That lands official at ~0.65 and
    // community at ~0.58: the 0.3 trust gap is the only thing between them.
    const middling = candidate({
      title: "Notes from a weekend of frontend tinkering",
      summary: "Some thoughts on rendering.",
      bodyText: `nextjs ${"word ".repeat(200)}`.trim(),
      publishedAt: "2026-09-01T12:00:00Z",
      canonicalUrl: "https://medium.com/@author/weekend-notes",
    });
    expect(qualifyCandidate(middling, context({ trust: "official" })).accepted).toBe(true);
    expect(qualifyCandidate(middling, context({ trust: "community" }))).toMatchObject({
      accepted: false,
      reason: "below_threshold",
    });
  });
});
