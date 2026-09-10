import type { RssCandidate } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * DEV.to (Forem) via its public articles API. No key, no quota.
 *
 * DEV is a publishing platform rather than a link aggregator: a hit *is* the
 * article, and it carries a reaction count. So unlike Hacker News the URL we
 * store is usually DEV's own -- except when the author cross-posted, which is
 * what `canonical_url` records, and in that case the original wins.
 */
export const DEV_TO_ENDPOINT = "https://dev.to/api/articles";

export interface DevToArticle {
  id: number | null;
  title: string | null;
  description: string | null;
  url: string | null;
  canonical_url: string | null;
  cover_image: string | null;
  social_image: string | null;
  published_at: string | null;
  positive_reactions_count: number | null;
  comments_count: number | null;
  reading_time_minutes: number | null;
  user?: { name?: string | null; username?: string | null } | null;
}

/**
 * Tag search, newest first within a reaction floor.
 *
 * `top` takes days and returns that window sorted by reactions, which is the
 * only way this API applies a popularity floor -- there is no `min_reactions`
 * parameter, so the floor is applied in `devToEngagement` after the fetch.
 */
export function devToSearchUrl(tag: string, windowDays: number, perPage: number): string {
  const params = new URLSearchParams({
    tag: tag.trim().toLowerCase(),
    top: String(Math.min(Math.max(1, Math.floor(windowDays)), 365)),
    per_page: String(Math.min(Math.max(1, perPage), 100)),
  });
  return `${DEV_TO_ENDPOINT}?${params.toString()}`;
}

/**
 * A DEV tag is a single lower-case token: the API silently returns the whole
 * firehose for a tag it does not recognise, so a malformed one would attach
 * arbitrary posts to a topic.
 */
export function isValidDevToTag(tag: string): boolean {
  return /^[a-z0-9]{2,30}$/.test(tag.trim().toLowerCase());
}

/**
 * The author's display name is real attribution here -- DEV reports the person
 * who wrote the post, not a submitter -- so unlike the Hacker News adapter it
 * is kept.
 */
export function candidateFromDevToArticle(article: DevToArticle): RssCandidate | null {
  if (!article.title || !article.url) return null;
  // A cross-posted article names its original home. Storing DEV's copy instead
  // would break the "every item retains its canonical URL" guarantee.
  const target = article.canonical_url?.trim() || article.url;
  try {
    return {
      externalId: article.id == null ? null : `devto:${article.id}`,
      canonicalUrl: canonicalizeUrl(target),
      title: article.title.slice(0, 500),
      author: article.user?.name?.trim() || null,
      summary: article.description?.trim() || null,
      bodyText: null,
      publishedAt: article.published_at,
      imageUrl: article.cover_image?.trim() || article.social_image?.trim() || null,
    };
  } catch {
    return null;
  }
}

/** Reactions plus comments: both are the crowd reacting, and Trending reads one number. */
export function devToEngagement(article: DevToArticle): number {
  return Math.max(0, article.positive_reactions_count ?? 0) + Math.max(0, article.comments_count ?? 0);
}
