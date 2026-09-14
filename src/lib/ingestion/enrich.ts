import type { RssCandidate } from "@/lib/ingestion/rss";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
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

/**
 * What happened when the source pages were fetched, so a run can say so.
 *
 * Enrichment failures used to be swallowed silently, which is right for the
 * item (the feed entry stands and the gate judges it) but wrong for the
 * operator: three days of Medium answering 403 to every page fetch went
 * unnoticed until someone asked why no new row had a body. `failures` is
 * keyed by host and error code -- never by URL -- so the summary is small
 * and safe to log.
 */
export interface EnrichmentReport {
  attempted: number;
  enriched: number;
  failed: number;
  failures: Record<string, number>;
}

function failureKey(url: string, error: unknown): string {
  let host = "unknown-host";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // Keep the placeholder.
  }
  const code = error instanceof Error && /^[A-Z0-9_:-]{2,80}$/.test(error.message) ? error.message : "FETCH_FAILED";
  return `${host}:${code}`;
}

/**
 * Fetches the source page for each entry and merges what it found into the
 * entry's candidate in place. A failed fetch keeps the feed's version; it never
 * throws. The page fetch is passed in so this stays pure and testable.
 */
export async function enrichBatch<T extends { candidate: RssCandidate }>(
  entries: T[],
  fetchPage: (url: string) => Promise<WebMetadata>,
  concurrency: number,
): Promise<EnrichmentReport> {
  const report: EnrichmentReport = { attempted: entries.length, enriched: 0, failed: 0, failures: {} };
  await runWithConcurrency(entries, concurrency, async (entry) => {
    try {
      entry.candidate = mergeExtraction(entry.candidate, await fetchPage(entry.candidate.canonicalUrl));
      report.enriched += 1;
    } catch (error) {
      report.failed += 1;
      const key = failureKey(entry.candidate.canonicalUrl, error);
      report.failures[key] = (report.failures[key] ?? 0) + 1;
    }
  });
  return report;
}
