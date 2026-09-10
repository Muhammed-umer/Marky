import { describe, expect, it } from "vitest";
import { parseRssFeed, safeImageUrl } from "@/lib/ingestion/rss";

describe("parseRssFeed", () => {
  it("normalizes Medium-style RSS items", () => {
    const items = parseRssFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
        <channel><item>
          <title><![CDATA[Building reliable AI systems]]></title>
          <link>https://medium.com/test/story?utm_source=feed#section</link>
          <guid>medium-story-1</guid>
          <dc:creator>Jane Developer</dc:creator>
          <pubDate>Thu, 28 Aug 2026 09:00:00 GMT</pubDate>
          <content:encoded><![CDATA[<p>A practical guide to evaluation.</p>]]></content:encoded>
          <media:thumbnail url="https://cdn-images-1.medium.com/max/1200/1-test.jpg" />
        </item></channel>
      </rss>`);

    expect(items).toEqual([expect.objectContaining({
      title: "Building reliable AI systems",
      canonicalUrl: "https://medium.com/test/story",
      externalId: "medium-story-1",
      author: "Jane Developer",
      summary: "A practical guide to evaluation.",
      publishedAt: "2026-08-28T09:00:00.000Z",
      imageUrl: "https://cdn-images-1.medium.com/max/1200/1-test.jpg",
    })]);
  });

  it("parses Atom alternate links and tolerates invalid entries", () => {
    const items = parseRssFeed(`<feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>atom-1</id><title>Cloud architecture notes</title><link rel="alternate" href="https://medium.com/cloud/notes"/><link rel="enclosure" href="https://miro.medium.com/v2/resize:fit:1200/1-test.jpg"/><author><name>Alex</name></author><updated>2026-08-28T10:00:00Z</updated><summary>Useful notes.</summary></entry>
      <entry><id>missing-link</id><title>Skipped</title></entry>
    </feed>`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ externalId: "atom-1", author: "Alex", canonicalUrl: "https://medium.com/cloud/notes", imageUrl: "https://miro.medium.com/v2/resize:fit:1200/1-test.jpg" });
  });

  it("retains an item with an unknown publication date for explicit downstream handling", () => {
    const items = parseRssFeed(`<rss><channel><item><title>Undated release</title><link>https://example.com/release?utm_source=feed</link></item></channel></rss>`);
    expect(items).toEqual([expect.objectContaining({ canonicalUrl: "https://example.com/release", publishedAt: null })]);
  });
});

describe("safeImageUrl", () => {
  it("accepts any public HTTPS publisher image, not only Medium", () => {
    expect(safeImageUrl("https://images.nvidia.com/hero.jpg")).toBe("https://images.nvidia.com/hero.jpg");
  });

  it("resolves a relative image against the item link", () => {
    expect(safeImageUrl("/assets/cover.png", "https://vercel.com/blog/post")).toBe("https://vercel.com/assets/cover.png");
  });

  it("rejects non-HTTPS, private and credentialed sources", () => {
    expect(safeImageUrl("http://example.com/a.png")).toBeNull();
    expect(safeImageUrl("https://127.0.0.1/a.png")).toBeNull();
    expect(safeImageUrl("https://localhost/a.png")).toBeNull();
    expect(safeImageUrl("https://user:pass@example.com/a.png")).toBeNull();
    expect(safeImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});

describe("feed body text", () => {
  it("keeps full content:encoded body separately from the truncated summary", () => {
    const body = "Sentence. ".repeat(400).trim();
    const items = parseRssFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel><item>
          <title>Long form post</title>
          <link>https://blog.example.com/long</link>
          <content:encoded><![CDATA[<p>${body}</p>]]></content:encoded>
        </item></channel>
      </rss>`);
    expect(items[0].summary?.length).toBe(1200);
    expect(items[0].bodyText?.length).toBeGreaterThan(1200);
    expect(items[0].bodyText?.length).toBeLessThanOrEqual(20_000);
  });

  it("reads a non-Medium feed image", () => {
    const items = parseRssFeed(`<?xml version="1.0"?>
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
        <channel><item>
          <title>Release notes</title>
          <link>https://vercel.com/blog/release</link>
          <media:thumbnail url="https://assets.vercel.com/image/release.png" />
        </item></channel>
      </rss>`);
    expect(items[0].imageUrl).toBe("https://assets.vercel.com/image/release.png");
  });
});
