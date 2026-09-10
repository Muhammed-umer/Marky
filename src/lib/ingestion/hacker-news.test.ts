import { describe, expect, it } from "vitest";
import { candidateFromHnHit, hnComments, hnEngagement, hnSearchUrl, type HnHit } from "@/lib/ingestion/hacker-news";
import { urlHash } from "@/lib/url";

function hit(overrides: Partial<HnHit> = {}): HnHit {
  return {
    objectID: "49549148",
    title: "We moved Railway's frontend off Next.js",
    url: "https://blog.railway.com/p/frontend-off-nextjs",
    points: 215,
    num_comments: 217,
    created_at: "2026-09-08T12:33:01Z",
    author: "fedecaccia",
    ...overrides,
  };
}

describe("hnSearchUrl", () => {
  it("restricts the search to titles", () => {
    // Without this the index matches comment text with typo tolerance: verified
    // 2026-09-09, a bare "nextjs" query returned 280 hits led by "Nancy Grace
    // Roman Space Telescope".
    expect(hnSearchUrl("Next.js", 15, 20)).toContain("restrictSearchableAttributes=title");
  });

  it("asks only for stories above the points floor", () => {
    const url = hnSearchUrl("Next.js", 15, 20);
    expect(url).toContain("tags=story");
    expect(decodeURIComponent(url)).toContain("numericFilters=points>15");
  });

  it("clamps the page size and refuses a negative floor", () => {
    expect(hnSearchUrl("x", -5, 999)).toContain("hitsPerPage=50");
    expect(decodeURIComponent(hnSearchUrl("x", -5, 999))).toContain("points>0");
  });

  it("encodes a query with characters that would break the URL", () => {
    expect(hnSearchUrl("Next.js & React", 10, 5)).toContain("query=Next.js+%26+React");
  });
});

describe("candidateFromHnHit", () => {
  it("points at the article, not the discussion", () => {
    expect(candidateFromHnHit(hit())?.canonicalUrl).toBe("https://blog.railway.com/p/frontend-off-nextjs");
  });

  it("never claims the submitter is the author", () => {
    // hit.author is the HN username. Presenting it as the article's author
    // would be fabricated attribution.
    const candidate = candidateFromHnHit(hit());
    expect(candidate?.author).toBeNull();
  });

  it("falls back to the discussion for a text post with no link", () => {
    const candidate = candidateFromHnHit(hit({ url: null, title: "Ask HN: how do you test Next.js?" }));
    expect(candidate?.canonicalUrl).toBe("https://news.ycombinator.com/item?id=49549148");
  });

  it("keeps the story's own date, not the time it was fetched", () => {
    expect(candidateFromHnHit(hit())?.publishedAt).toBe("2026-09-08T12:33:01Z");
  });

  it("hashes to the same item the publisher's own feed would produce", () => {
    // This is what lets HN add a reaction count to an article already stored
    // from its RSS feed instead of duplicating it.
    const candidate = candidateFromHnHit(hit());
    expect(urlHash(candidate!.canonicalUrl)).toBe(urlHash("https://blog.railway.com/p/frontend-off-nextjs"));
  });

  it("drops a hit with no title or an unusable link", () => {
    expect(candidateFromHnHit(hit({ title: null }))).toBeNull();
    expect(candidateFromHnHit(hit({ url: "not a url" }))).toBeNull();
  });

  it("carries no summary or image, which is what triggers extraction", () => {
    const candidate = candidateFromHnHit(hit());
    expect(candidate?.summary).toBeNull();
    expect(candidate?.imageUrl).toBeNull();
  });
});

describe("engagement", () => {
  it("reads points and comments as reported", () => {
    expect(hnEngagement(hit())).toBe(215);
    expect(hnComments(hit())).toBe(217);
  });

  it("treats a missing count as zero rather than inventing one", () => {
    expect(hnEngagement(hit({ points: null }))).toBe(0);
    expect(hnComments(hit({ num_comments: null }))).toBe(0);
  });

  it("never reports a negative count", () => {
    expect(hnEngagement(hit({ points: -3 }))).toBe(0);
  });
});
