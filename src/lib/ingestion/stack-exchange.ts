import { stripMarkup, type RssCandidate } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * Stack Exchange via API 2.3. No key needed, but the only adapter here with a
 * quota worth respecting: 300 requests per IP per day unauthenticated, shared
 * across every site. That is why these sources run on a long interval and pass
 * through the quota ledger (src/lib/ingestion/quota.ts).
 *
 * A question is not an article, so the bar is deliberately different: only
 * answered, well-scored questions qualify, and the body comes from the API
 * rather than from fetching the page.
 */
export const STACK_EXCHANGE_ENDPOINT = "https://api.stackexchange.com/2.3/search/advanced";

/**
 * `withbody` is the documented built-in that adds `body` to the default
 * question projection. Deliberately a named alias rather than a generated
 * filter id: those are opaque, are minted per application, and a wrong one
 * fails the whole request rather than degrading.
 */
export const STACK_EXCHANGE_FILTER = "withbody";

export interface StackExchangeQuestion {
  question_id: number | null;
  title: string | null;
  link: string | null;
  score: number | null;
  answer_count: number | null;
  is_answered: boolean | null;
  creation_date: number | null;
  last_activity_date: number | null;
  /** HTML, supplied by the `withbody` filter. */
  body: string | null;
  owner?: { display_name?: string | null } | null;
}

export interface StackExchangeResponse {
  items?: StackExchangeQuestion[];
  quota_remaining?: number | null;
  backoff?: number | null;
}

/** Sites are a fixed slug, and a bad one returns someone else's community. */
export function isValidStackExchangeSite(site: string): boolean {
  return /^[a-z0-9](?:[a-z0-9.-]{0,40}[a-z0-9])?$/.test(site.trim().toLowerCase());
}

/**
 * The site slug a source searches, read from `sites.site_url` so no column has
 * to be added for it. `https://stackoverflow.com` -> `stackoverflow`.
 */
export function stackExchangeSiteFromUrl(siteUrl: string | null): string | null {
  if (!siteUrl) return null;
  try {
    const host = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "stackoverflow.com") return "stackoverflow";
    if (host === "serverfault.com") return "serverfault";
    if (host === "superuser.com") return "superuser";
    const match = host.match(/^([a-z0-9-]+)\.stackexchange\.com$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Tagged search, highest-voted first, restricted to answered questions.
 *
 * `sort=votes` rather than `creation`: an unanswered question asked an hour ago
 * is not a story, and the freshness term in the scorer already penalises age.
 * `accepted` is deliberately not required -- plenty of good answers are never
 * accepted by the asker.
 */
export function stackExchangeSearchUrl(
  site: string,
  tag: string,
  minScore: number,
  pageSize: number,
  fromDate?: Date,
): string {
  const params = new URLSearchParams({
    site: site.trim().toLowerCase(),
    tagged: tag.trim().toLowerCase(),
    order: "desc",
    sort: "votes",
    answers: "1",
    min: String(Math.max(0, Math.floor(minScore))),
    pagesize: String(Math.min(Math.max(1, pageSize), 100)),
    filter: STACK_EXCHANGE_FILTER,
  });
  // `min` applies to the sort field, which is votes here, so the date window
  // needs its own parameter.
  if (fromDate) params.set("fromdate", String(Math.floor(fromDate.getTime() / 1000)));
  return `${STACK_EXCHANGE_ENDPOINT}?${params.toString()}`;
}

function epochToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

/**
 * The asker's display name is not the author of an answer, and a question's
 * value here is the answer. Attribution stays with the site, so `author` is
 * left null rather than crediting the wrong person -- the same reasoning the
 * Hacker News adapter applies to submitters.
 */
export function candidateFromStackExchangeQuestion(question: StackExchangeQuestion): RssCandidate | null {
  if (!question.title || !question.link) return null;
  try {
    return {
      externalId: question.question_id == null ? null : `se:${question.question_id}`,
      canonicalUrl: canonicalizeUrl(question.link),
      // Titles arrive HTML-escaped ("What&#39;s the difference").
      title: (stripMarkup(question.title, 500) ?? question.title).slice(0, 500),
      author: null,
      summary: stripMarkup(question.body, 400),
      bodyText: stripMarkup(question.body),
      publishedAt: epochToIso(question.creation_date),
      imageUrl: null,
    };
  } catch {
    return null;
  }
}

/** Score plus answers: the vote is the reaction, the answers are the engagement. */
export function stackExchangeEngagement(question: StackExchangeQuestion): number {
  return Math.max(0, question.score ?? 0) + Math.max(0, question.answer_count ?? 0);
}
