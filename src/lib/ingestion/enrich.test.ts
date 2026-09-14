import { describe, expect, it } from "vitest";
import { enrichBatch, mergeExtraction, needsEnrichment } from "@/lib/ingestion/enrich";
import type { RssCandidate } from "@/lib/ingestion/rss";
import type { WebMetadata } from "@/lib/ingestion/web-metadata";

function candidate(overrides: Partial<RssCandidate> = {}): RssCandidate {
  return {
    externalId: null,
    canonicalUrl: "https://medium.com/@author/a-post",
    title: "A post",
    author: "Feed Author",
    summary: "Feed summary.",
    bodyText: "word ".repeat(500).trim(),
    publishedAt: "2026-09-09T09:00:00Z",
    imageUrl: "https://miro.medium.com/feed.jpg",
    ...overrides,
  };
}

function metadata(overrides: Partial<WebMetadata> = {}): WebMetadata {
  return {
    canonicalUrl: "https://medium.com/@author/a-post",
    title: "A post",
    author: "Page Author",
    summary: "Page summary.",
    bodyText: "page ".repeat(900).trim(),
    imageUrl: "https://miro.medium.com/og.jpg",
    publishedAt: null,
    ...overrides,
  };
}

describe("needsEnrichment", () => {
  it("leaves a complete feed entry alone", () => {
    expect(needsEnrichment(candidate())).toBe(false);
  });

  it("fetches when the feed carried no image", () => {
    expect(needsEnrichment(candidate({ imageUrl: null }))).toBe(true);
  });

  it("fetches when the feed body is a teaser", () => {
    expect(needsEnrichment(candidate({ bodyText: "word ".repeat(120) }))).toBe(true);
    expect(needsEnrichment(candidate({ bodyText: null }))).toBe(true);
  });
});

describe("mergeExtraction", () => {
  it("keeps what the feed stated and fills only the gaps", () => {
    const merged = mergeExtraction(candidate({ imageUrl: null }), metadata());
    expect(merged.author).toBe("Feed Author");
    expect(merged.summary).toBe("Feed summary.");
    expect(merged.imageUrl).toBe("https://miro.medium.com/og.jpg");
  });

  it("takes the page body when it is longer than the feed's", () => {
    const merged = mergeExtraction(candidate({ bodyText: "word ".repeat(120) }), metadata());
    expect(merged.bodyText).toBe(metadata().bodyText);
  });

  it("keeps the feed body when extraction found less", () => {
    const merged = mergeExtraction(candidate(), metadata({ bodyText: "Subscribe to read." }));
    expect(merged.bodyText).toBe(candidate().bodyText);
  });

  it("does not invent fields the page lacks either", () => {
    const merged = mergeExtraction(
      candidate({ author: null, imageUrl: null, summary: null }),
      metadata({ author: null, imageUrl: null, summary: null }),
    );
    expect(merged.author).toBeNull();
    expect(merged.imageUrl).toBeNull();
    expect(merged.summary).toBeNull();
  });
});

describe("enrichBatch", () => {
  it("merges successful fetches in place and counts failures by host and code, never by URL", async () => {
    const entries = [
      { candidate: candidate({ canonicalUrl: "https://medium.com/@a/one", imageUrl: null }) },
      { candidate: candidate({ canonicalUrl: "https://medium.com/@b/two", imageUrl: null }) },
      { candidate: candidate({ canonicalUrl: "https://huggingface.co/blog/three", imageUrl: null }) },
    ];
    const fetchPage = async (url: string) => {
      if (url.startsWith("https://medium.com")) throw new Error("HTTP_403");
      return metadata({ canonicalUrl: url });
    };
    const report = await enrichBatch(entries, fetchPage, 2);
    expect(report).toEqual({ attempted: 3, enriched: 1, failed: 2, failures: { "medium.com:HTTP_403": 2 } });
    expect(entries[2].candidate.imageUrl).toBe("https://miro.medium.com/og.jpg");
    // Failed entries keep the feed's version untouched.
    expect(entries[0].candidate.imageUrl).toBeNull();
    expect(JSON.stringify(report)).not.toContain("/@a/one");
  });

  it("never throws, and maps an unexpected error to a generic code", async () => {
    const entries = [{ candidate: candidate({ canonicalUrl: "https://example.com/p" }) }];
    const report = await enrichBatch(entries, async () => { throw new TypeError("socket hang up"); }, 1);
    expect(report.failures).toEqual({ "example.com:FETCH_FAILED": 1 });
  });
});
