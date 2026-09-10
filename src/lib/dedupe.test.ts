import { describe, expect, it } from "vitest";
import { chooseKeeper, findDuplicateGroups, MAX_DUPLICATE_DAY_SPREAD, richness, type DedupeItem } from "@/lib/dedupe";

function item(overrides: Partial<DedupeItem> & { id: string; title: string }): DedupeItem {
  return {
    canonicalUrl: `https://example.com/${overrides.id}`,
    bodyContent: null,
    imageUrl: null,
    author: null,
    publishedAt: null,
    fetchedAt: null,
    ...overrides,
  };
}

const body = (words: number) => Array.from({ length: words }, () => "word").join(" ");

describe("richness", () => {
  it("prefers a full extraction over a teaser", () => {
    expect(richness(item({ id: "a", title: "t", bodyContent: body(400) }))).toBeGreaterThan(
      richness(item({ id: "b", title: "t", bodyContent: body(20) })),
    );
  });

  it("counts an image and a real byline, but not a placeholder one", () => {
    const withAuthor = item({ id: "a", title: "t", imageUrl: "https://cdn.example.com/a.png", author: "Ada Lovelace" });
    const withPlaceholder = item({ id: "b", title: "t", imageUrl: "https://cdn.example.com/b.png", author: "Unknown" });
    expect(richness(withAuthor)).toBe(3);
    expect(richness(withPlaceholder)).toBe(2);
  });
});

describe("chooseKeeper", () => {
  it("keeps the richest row", () => {
    const thin = item({ id: "thin", title: "Next.js 16 is out", publishedAt: "2026-09-01T00:00:00Z" });
    const rich = item({
      id: "rich",
      title: "Next.js 16 is out",
      bodyContent: body(500),
      imageUrl: "https://cdn.example.com/x.png",
      publishedAt: "2026-09-02T00:00:00Z",
    });
    expect(chooseKeeper([thin, rich]).id).toBe("rich");
  });

  it("breaks a richness tie on the earliest publication", () => {
    const later = item({ id: "later", title: "Same", bodyContent: body(500), publishedAt: "2026-09-05T00:00:00Z" });
    const earlier = item({ id: "earlier", title: "Same", bodyContent: body(500), publishedAt: "2026-09-03T00:00:00Z" });
    expect(chooseKeeper([later, earlier]).id).toBe("earlier");
  });

  it("is deterministic when every tie-break is equal", () => {
    const left = item({ id: "aaa", title: "Same" });
    const right = item({ id: "bbb", title: "Same" });
    expect(chooseKeeper([left, right]).id).toBe(chooseKeeper([right, left]).id);
  });

  it("ranks a known date above an unknown one", () => {
    const dated = item({ id: "dated", title: "Same", publishedAt: "2026-09-03T00:00:00Z" });
    const undated = item({ id: "undated", title: "Same" });
    expect(chooseKeeper([undated, dated]).id).toBe("dated");
  });
});

describe("findDuplicateGroups", () => {
  it("returns nothing when every title is distinct", () => {
    const items = [
      item({ id: "a", title: "React 20 release candidate" }),
      item({ id: "b", title: "Supabase adds branching to every project" }),
      item({ id: "c", title: "NVIDIA announces Blackwell Ultra" }),
    ];
    expect(findDuplicateGroups(items)).toEqual([]);
  });

  it("groups the same story stored under two URLs", () => {
    const items = [
      item({ id: "a", title: "OpenAI releases a new reasoning model", publishedAt: "2026-09-01T00:00:00Z" }),
      item({ id: "b", title: "OpenAI releases a new reasoning model", bodyContent: body(500), publishedAt: "2026-09-01T06:00:00Z" }),
    ];
    const groups = findDuplicateGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].keep.id).toBe("b");
    expect(groups[0].remove.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("merges a transitive chain into one group with one survivor", () => {
    const items = [
      item({ id: "a", title: "Vercel ships fluid compute for every plan" }),
      item({ id: "b", title: "Vercel ships fluid compute for every plan" }),
      item({ id: "c", title: "Vercel ships fluid compute for every plan" }),
    ];
    const groups = findDuplicateGroups(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].remove).toHaveLength(2);
  });

  it("keeps recurring editions apart when their dates are far enough apart", () => {
    const items = [
      item({ id: "week1", title: "This week in TypeScript", publishedAt: "2026-08-01T00:00:00Z" }),
      item({ id: "week5", title: "This week in TypeScript", publishedAt: "2026-09-05T00:00:00Z" }),
    ];
    expect(findDuplicateGroups(items)).toEqual([]);
  });

  it("still groups identical titles published inside the window", () => {
    const withinWindow = new Date(Date.parse("2026-09-01T00:00:00Z") + (MAX_DUPLICATE_DAY_SPREAD - 1) * 86_400_000).toISOString();
    const items = [
      item({ id: "a", title: "GitHub Actions gets native ARM runners", publishedAt: "2026-09-01T00:00:00Z" }),
      item({ id: "b", title: "GitHub Actions gets native ARM runners", publishedAt: withinWindow }),
    ];
    expect(findDuplicateGroups(items)).toHaveLength(1);
  });

  it("never separates items on an unknown date", () => {
    const items = [
      item({ id: "a", title: "Hugging Face launches inference endpoints v2", publishedAt: "2026-01-01T00:00:00Z" }),
      item({ id: "b", title: "Hugging Face launches inference endpoints v2" }),
    ];
    expect(findDuplicateGroups(items)).toHaveLength(1);
  });

  it("does not group titles that merely share a phrase", () => {
    const items = [
      item({ id: "a", title: "Supabase launches vector search for Postgres" }),
      item({ id: "b", title: "Supabase launches a new dashboard for teams and billing" }),
    ];
    expect(findDuplicateGroups(items)).toEqual([]);
  });

  it("predicts the same removals when the input order changes", () => {
    const items = [
      item({ id: "a", title: "Neon adds instant point-in-time restore", publishedAt: "2026-09-02T00:00:00Z" }),
      item({ id: "b", title: "Neon adds instant point-in-time restore", publishedAt: "2026-09-03T00:00:00Z" }),
      item({ id: "c", title: "Resend adds inbound email parsing" }),
    ];
    const forward = findDuplicateGroups(items);
    const reversed = findDuplicateGroups([...items].reverse());
    expect(forward[0].keep.id).toBe(reversed[0].keep.id);
    expect(forward[0].remove.map((entry) => entry.id)).toEqual(reversed[0].remove.map((entry) => entry.id));
  });
});
