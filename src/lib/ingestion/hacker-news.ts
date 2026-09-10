import type { RssCandidate } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * Hacker News via the Algolia index. No key, no quota worth tracking.
 *
 * HN is a discovery source, not a publisher: a hit points at somebody else's
 * article and carries the crowd's reaction to it. So the adapter takes the
 * link and the vote counts, and leaves the article itself to the extraction
 * step that already runs before qualification.
 */
export const HN_ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date";

export interface HnHit {
  objectID: string;
  title: string | null;
  url: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string | null;
  author: string | null;
}

/**
 * Searches titles only.
 *
 * Verified against the live index on 2026-09-09: a bare `query=nextjs` returns
 * 280 hits led by "Nancy Grace Roman Space Telescope" and unrelated Show HN
 * posts, because Algolia matches across the comment and story text with typo
 * tolerance. Restricting to the title drops it to 109 hits that are actually
 * about Next.js. Without this the gate would reject most of what we fetch,
 * which works but wastes the run.
 */
export function hnSearchUrl(query: string, minPoints: number, hitsPerPage: number): string {
  const params = new URLSearchParams({
    query,
    tags: "story",
    restrictSearchableAttributes: "title",
    // Off because Algolia's fuzzy matching is wrong for product names: with it
    // on, a "Vercel" search returns "Vermell - dependency-free C++ web
    // framework" (verified 2026-09-09). The gate would reject those, but only
    // after the run had spent a page fetch on each.
    typoTolerance: "false",
    numericFilters: `points>${Math.max(0, Math.floor(minPoints))}`,
    hitsPerPage: String(Math.min(Math.max(1, hitsPerPage), 50)),
  });
  return `${HN_ENDPOINT}?${params.toString()}`;
}

/** The discussion, used when a story has no external link of its own. */
export function hnDiscussionUrl(objectID: string): string {
  return `https://news.ycombinator.com/item?id=${objectID}`;
}

/**
 * A hit becomes a candidate for the article it points at.
 *
 * `author` is deliberately dropped. The HN field is the submitter's username,
 * not the article's author, and presenting one as the other would be exactly
 * the fabricated attribution the honesty rules forbid. The real author comes
 * from extracting the page, or stays null.
 */
export function candidateFromHnHit(hit: HnHit): RssCandidate | null {
  if (!hit.title || !hit.objectID) return null;
  // A text post (Ask HN, Show HN with no link) is its own discussion.
  const target = hit.url ?? hnDiscussionUrl(hit.objectID);
  try {
    return {
      externalId: `hn:${hit.objectID}`,
      canonicalUrl: canonicalizeUrl(target),
      title: hit.title.slice(0, 500),
      author: null,
      summary: null,
      bodyText: null,
      publishedAt: hit.created_at,
      imageUrl: null,
    };
  } catch {
    return null;
  }
}

/** Points, the number the qualification scorer normalises against HN's scale. */
export function hnEngagement(hit: HnHit): number {
  return Math.max(0, hit.points ?? 0);
}

/** Comments are a second, independent reaction and are stored alongside points. */
export function hnComments(hit: HnHit): number {
  return Math.max(0, hit.num_comments ?? 0);
}
