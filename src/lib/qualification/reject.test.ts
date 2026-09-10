import { describe, expect, it } from "vitest";
import { isAggregatorDomain } from "@/lib/qualification/reject";

describe("aggregator domains", () => {
  it("does not treat medium.com as an aggregator", () => {
    // Medium tag feeds are a seeded community source. A post on medium.com is
    // the canonical home of that story, unlike a Hacker News or Reddit link.
    expect(isAggregatorDomain("https://medium.com/@author/a-post-abc123")).toBe(false);
  });

  it("still rejects the aggregator publication hosted on a medium subdomain", () => {
    expect(isAggregatorDomain("https://medium.datadriveninvestor.com/a-post")).toBe(true);
  });

  it("still rejects the link aggregators", () => {
    expect(isAggregatorDomain("https://news.ycombinator.com/item?id=1")).toBe(true);
    expect(isAggregatorDomain("https://www.reddit.com/r/reactjs/comments/x")).toBe(true);
  });

  it("rejects a URL it cannot parse rather than letting it through", () => {
    expect(isAggregatorDomain("not a url")).toBe(true);
  });
});
