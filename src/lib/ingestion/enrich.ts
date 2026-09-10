import type { RssCandidate } from "@/lib/ingestion/rss";
import type { WebMetadata } from "@/lib/ingestion/web-metadata";
import { SUBSTANTIAL_WORDS, words } from "@/lib/qualification/score";

/**
 * A feed entry is a teaser for the page, not the page. Official blogs often
 * ship only a summary; Medium truncates member-only stories; many feeds carry
 * no image at all. When that is the case the source page itself is the record
 * of what was published, and it is fetched before the item is scored so
 * substance is judged on the article rather than on the teaser.
 *
 * These two functions are the decision and the merge; the fetch lives with the
 * adapter so this stays pure and testable.
 */
export function needsEnrichment(candidate: RssCandidate): boolean {
  return !candidate.imageUrl || words(candidate.bodyText).length < SUBSTANTIAL_WORDS;
}

/**
 * The feed keeps precedence for everything it actually stated; the page only
 * fills gaps. Body text is the exception: the longer of the two wins, because
 * the whole reason for the fetch is a feed that carried less than the page.
 */
export function mergeExtraction(candidate: RssCandidate, metadata: WebMetadata): RssCandidate {
  const feedBody = candidate.bodyText ?? "";
  const pageBody = metadata.bodyText ?? "";
  const bodyText = words(pageBody).length > words(feedBody).length ? metadata.bodyText : candidate.bodyText;
  return {
    ...candidate,
    author: candidate.author ?? metadata.author,
    summary: candidate.summary ?? metadata.summary,
    bodyText,
    imageUrl: candidate.imageUrl ?? metadata.imageUrl,
  };
}
