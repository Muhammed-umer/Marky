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
});
