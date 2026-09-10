import { words } from "@/lib/qualification/score";
import type { QualificationCandidate, QualificationContext } from "@/lib/qualification/types";

export const NEAR_DUPLICATE_THRESHOLD = 0.8;

/**
 * Domains that republish other people's writing. Their URLs are not the
 * canonical home of the story, so storing them breaks attribution.
 */
const AGGREGATOR_DOMAINS = new Set([
  "news.ycombinator.com",
  "reddit.com",
  "lobste.rs",
  "techmeme.com",
  "flipboard.com",
  "getpocket.com",
  "news.google.com",
  "medium.datadriveninvestor.com",
  "hackernewsletter.com",
]);

const SPAM_MARKERS = [
  "sponsored post",
  "paid partnership",
  "this post is sponsored",
  "affiliate link",
  "buy now",
  "coupon code",
];

const PAYWALL_MARKERS = [
  "subscribe to continue",
  "subscribers only",
  "this article is for paid",
  "become a member to read",
  "create an account to keep reading",
];

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Word bigrams, falling back to unigrams for titles too short to shingle. */
export function shingles(title: string): Set<string> {
  const tokens = words(title);
  if (tokens.length < 2) return new Set(tokens);
  const result = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    result.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  return result;
}

export function jaccard(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const entry of left) if (right.has(entry)) shared += 1;
  return shared / (left.size + right.size - shared);
}

export function isNearDuplicateTitle(title: string, recentTitles: string[]): boolean {
  const target = shingles(title);
  return recentTitles.some((recent) => jaccard(target, shingles(recent)) > NEAR_DUPLICATE_THRESHOLD);
}

export function isAggregatorDomain(url: string): boolean {
  const host = hostname(url);
  if (!host) return true;
  return [...AGGREGATOR_DOMAINS].some((domain) => host === domain || host.endsWith(`.${domain}`));
}

export function looksLikeSpam(candidate: QualificationCandidate): boolean {
  const haystack = `${candidate.title} ${candidate.summary ?? ""}`.toLowerCase();
  return SPAM_MARKERS.some((marker) => haystack.includes(marker));
}

export function isPaywalledWithoutSummary(candidate: QualificationCandidate): boolean {
  if (candidate.paywalled && !candidate.summary && !candidate.bodyText) return true;
  const body = (candidate.bodyText ?? candidate.summary ?? "").toLowerCase();
  if (!body) return false;
  return PAYWALL_MARKERS.some((marker) => body.includes(marker)) && body.length < 400;
}


/**
 * Marky's topics, aliases and UI are English, so a story nobody in the audience
 * can read is not a lower-quality story -- it is the wrong story. Medium tag
 * feeds in particular mix languages freely under an English tag.
 *
 * Detection is deliberately two-stage and conservative, because a false
 * positive silently drops a legitimate article.
 */

/** Scripts that are never incidental to an English technology article. */
const NON_LATIN_SCRIPT =
  /[ऀ-ॿঀ-৿਀-੿஀-௿ఀ-౿ഀ-ൿ฀-๿Ѐ-ӿ؀-ۿ֐-׿一-鿿぀-ヿ가-힯Ͱ-Ͽ]/g;
const LATIN_LETTER = /[A-Za-z]/g;

/**
 * Fraction of letters written in a non-Latin script. A ratio rather than mere
 * presence: an English post may legitimately quote a Chinese model name or a
 * Devanagari example without being a non-English post.
 */
export function nonLatinRatio(text: string): number {
  const nonLatin = (text.match(NON_LATIN_SCRIPT) ?? []).length;
  const latin = (text.match(LATIN_LETTER) ?? []).length;
  const total = nonLatin + latin;
  return total === 0 ? 0 : nonLatin / total;
}

const NON_LATIN_LIMIT = 0.2;

/**
 * Function words carry no topic meaning, so their absence is a better language
 * signal than any keyword list. Checked only on Latin-script text, where the
 * script test cannot help -- this is what catches Spanish or Indonesian posts,
 * and transliterated Hindi written in Latin letters.
 */
const ENGLISH_STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are", "was", "have",
  "has", "not", "but", "can", "will", "how", "what", "when", "which", "they", "their", "its",
  "it", "is", "of", "to", "in", "on", "at", "by", "we", "our", "as", "an", "be", "or", "if",
]);

/** Below this share of function words, Latin-script prose is very unlikely to be English. */
const MIN_STOPWORD_RATIO = 0.08;
/** Short text has too few function words to judge; a title alone proves nothing. */
const MIN_WORDS_TO_JUDGE = 40;

export function englishStopwordRatio(text: string): number {
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (!tokens.length) return 0;
  return tokens.filter((token) => ENGLISH_STOPWORDS.has(token)).length / tokens.length;
}

/** Distinct words needed before a stopword ratio means anything. */
const MIN_DISTINCT_WORDS = 20;

export function isLikelyNonEnglish(candidate: QualificationCandidate): boolean {
  const text = `${candidate.title} ${candidate.summary ?? ""} ${candidate.bodyText ?? ""}`.trim();
  if (!text) return false;

  // Stage 1: script. Reliable, and the reason this check exists -- Devanagari,
  // CJK, Cyrillic and the rest are never incidental to an English article.
  //
  // The title is measured on its own as well as with the body, because summary
  // boilerplate (author lines, URLs, tags) is Latin even on a foreign-language
  // post and drags the combined ratio down. Measured against the stored rows on
  // 2026-09-09: a Marathi, a Russian and a Chinese article all scored 0.14-0.19
  // combined -- under any sane combined threshold -- while their titles scored
  // 0.48, 0.86 and 1.00.
  if (nonLatinRatio(candidate.title) > NON_LATIN_LIMIT) return true;
  if (nonLatinRatio(text) > NON_LATIN_LIMIT) return true;

  // Stage 2: function words, for Latin-script text the script test cannot help
  // with. Deliberately hard to trigger, because a false positive silently drops
  // a real article while a false negative merely shows one odd item.
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (tokens.length < MIN_WORDS_TO_JUDGE) return false;
  // Vocabulary this narrow is boilerplate, a word list or placeholder text --
  // not prose whose language can be judged either way.
  if (new Set(tokens).size < MIN_DISTINCT_WORDS) return false;
  return englishStopwordRatio(text) < MIN_STOPWORD_RATIO;
}

/**
 * Checks that make scoring pointless. Returns a machine-readable reason, or
 * null when the candidate should go on to be scored.
 */
export function hardRejectReason(candidate: QualificationCandidate, context: QualificationContext): string | null {
  if (context.duplicate) return "duplicate_url_hash";
  if (isAggregatorDomain(candidate.canonicalUrl)) return "aggregator_domain";
  if (looksLikeSpam(candidate)) return "spam_markers";
  if (isPaywalledWithoutSummary(candidate)) return "paywalled_without_summary";
  if (isNearDuplicateTitle(candidate.title, context.recentTitles ?? [])) return "near_duplicate_title";
  if (isLikelyNonEnglish(candidate)) return "non_english";
  return null;
}
