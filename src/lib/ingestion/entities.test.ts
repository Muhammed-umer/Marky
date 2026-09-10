import { describe, expect, it } from "vitest";
import { decodeEntities, parseRssFeed } from "@/lib/ingestion/rss";
import { isLikelyNonEnglish } from "@/lib/qualification/reject";

describe("decodeEntities", () => {
  it("decodes the numeric entities that reached the reader verbatim", () => {
    // Counts from the 298 stored rows on 2026-09-09.
    expect(decodeEntities("Google&#x2019;s guide&#x2026;")).toBe("Google’s guide…");
    expect(decodeEntities("wait&#8230;")).toBe("wait…");
    expect(decodeEntities("a &#x2014; b")).toBe("a — b");
  });

  it("decodes entity-encoded non-Latin text", () => {
    expect(decodeEntities("&#x41F;&#x43E;&#x447;")).toBe("Поч");
    expect(decodeEntities("&#x90F;&#x91C;")).toBe("एज");
  });

  it("unwraps double encoding, which is how these were produced", () => {
    // plainText used to turn &amp; into & first, manufacturing an entity it
    // then could not decode.
    expect(decodeEntities("Google&amp;#x2019;s")).toBe("Google’s");
  });

  it("keeps named entities working", () => {
    expect(decodeEntities("a &amp; b &lt;tag&gt; &quot;q&quot; &nbsp;x")).toBe('a & b <tag> "q"  x');
  });

  it("leaves a malformed or unknown entity untouched rather than corrupting it", () => {
    expect(decodeEntities("&#xZZZ; &notanentity; &#0; &#x110000;")).toBe("&#xZZZ; &notanentity; &#0; &#x110000;");
  });

  it("does not produce a lone surrogate", () => {
    expect(decodeEntities("&#xD800;")).toBe("&#xD800;");
  });
});

describe("feed parsing end to end", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item>
      <title>Open AI &#x91A;&#x93E; test</title>
      <link>https://medium.com/@a/post-1</link>
      <pubDate>Tue, 09 Sep 2026 09:00:00 GMT</pubDate>
      <description><![CDATA[700 &#x90F;&#x91C;&#x902;&#x91F;&#x94D;&#x938; &#x91A;&#x93E; Open AI&#x2026;]]></description>
    </item></channel></rss>`;

  it("decodes entities in both title and description", () => {
    const [candidate] = parseRssFeed(xml);
    expect(candidate.title).toBe("Open AI चा test");
    expect(candidate.summary).toContain("एजंट्स");
    expect(candidate.summary).not.toContain("&#x");
  });

  it("lets the language check see the script that was hidden as ASCII", () => {
    const [candidate] = parseRssFeed(xml);
    // Before decoding, this summary was pure ASCII and scored a non-Latin
    // ratio of zero.
    expect(isLikelyNonEnglish({
      title: candidate.title,
      summary: candidate.summary,
      bodyText: candidate.bodyText,
      canonicalUrl: candidate.canonicalUrl,
      publishedAt: candidate.publishedAt,
    })).toBe(true);
  });
});
