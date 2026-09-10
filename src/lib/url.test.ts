import { describe, expect, it } from "vitest";
import { canonicalizeUrl, urlHash } from "./url";

describe("canonicalizeUrl", () => {
  it("removes tracking and fragments", () => {
    expect(canonicalizeUrl("https://Example.com/story/?utm_source=x&b=2&a=1#top")).toBe("https://example.com/story?a=1&b=2");
  });
  it("rejects unsupported protocols", () => expect(() => canonicalizeUrl("file:///secret")).toThrow());
  it("hashes equivalent URLs identically", () => {
    expect(urlHash("https://example.com/a?utm_source=x")).toBe(urlHash("https://example.com/a"));
  });
  it("collapses the same Medium post found under different tag feeds", () => {
    // Medium stamps the discovering feed into ?source=, so one post reached
    // through two tags would otherwise store twice.
    const viaNextjs = "https://medium.com/@author/a-post-abc123?source=rss----0f2b1c9d4e5a---4";
    const viaReact = "https://medium.com/@author/a-post-abc123?source=rss----9a8b7c6d5e4f---4";
    expect(urlHash(viaNextjs)).toBe(urlHash(viaReact));
    expect(canonicalizeUrl(viaNextjs)).toBe("https://medium.com/@author/a-post-abc123");
  });
  it("keeps a source parameter that is not a feed stamp", () => {
    // Narrow on purpose: widening this would change url_hash for stored URLs.
    expect(canonicalizeUrl("https://example.com/a?source=newsletter")).toBe("https://example.com/a?source=newsletter");
  });
});
