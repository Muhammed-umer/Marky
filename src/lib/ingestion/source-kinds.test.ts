import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DISCOVERY_SOURCE_TYPES,
  FEED_SOURCE_TYPES,
  matchesKind,
  parseIngestKind,
} from "@/lib/ingestion/source-kinds";

/** The source types the schema actually allows, read from the live migration. */
function allowedSourceTypes(): string[] {
  const sql = fs.readFileSync("supabase/migrations/20260910000000_add_free_discovery_adapters.sql", "utf8");
  const block = sql.match(/CHECK \(source_type IN \(([\s\S]*?)\)\)/);
  if (!block) throw new Error("source_type CHECK constraint not found");
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("cron ownership", () => {
  it("assigns every allowed source type to exactly one cron job", () => {
    // A type in neither set is ingested by no cron at all, and fails silently:
    // the sources simply never come due.
    const feeds = new Set<string>(FEED_SOURCE_TYPES);
    const discovery = new Set<string>(DISCOVERY_SOURCE_TYPES);
    for (const type of allowedSourceTypes()) {
      const owners = [feeds.has(type), discovery.has(type)].filter(Boolean).length;
      expect(owners, `${type} is owned by ${owners} cron jobs`).toBe(1);
    }
  });

  it("keeps the two sets disjoint", () => {
    const overlap = FEED_SOURCE_TYPES.filter((t) => (DISCOVERY_SOURCE_TYPES as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });
});

describe("matchesKind", () => {
  it("routes feeds and discovery to their own job", () => {
    expect(matchesKind("rss", "feeds")).toBe(true);
    expect(matchesKind("rss", "discovery")).toBe(false);
    expect(matchesKind("hacker_news", "discovery")).toBe(true);
    expect(matchesKind("hacker_news", "feeds")).toBe(false);
  });

  it("lets everything through when no kind is given", () => {
    for (const type of ["rss", "medium_rss", "hacker_news", "youtube"]) {
      expect(matchesKind(type, "all")).toBe(true);
    }
  });
});

describe("parseIngestKind", () => {
  it("falls back to all, so a malformed call still ingests", () => {
    expect(parseIngestKind(null)).toBe("all");
    expect(parseIngestKind("nonsense")).toBe("all");
    expect(parseIngestKind("feeds")).toBe("feeds");
    expect(parseIngestKind("discovery")).toBe("discovery");
  });
});
