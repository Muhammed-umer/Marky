import type { Interest } from "@/lib/types";

/**
 * Picks the most informative sentences out of an article body.
 *
 * Extractive on purpose: every line it returns is a sentence the publisher
 * actually wrote, in their words. A generated summary would be new text
 * presented as the article's meaning, which is the kind of fabrication the
 * honesty rules exist to prevent -- and it would be wrong sometimes, silently.
 * This can only ever be a worse selection, never a false statement.
 *
 * It is also arithmetic, in keeping with the Discovery Map's rule that nothing
 * learned or generative lands until the deterministic version demonstrably
 * fails.
 */

/**
 * Lines that carry no meaning: feed boilerplate, nav furniture, calls to
 * action, and the reader chrome that extraction sweeps up with the prose.
 *
 * The Medium entries matter more than they look: its article pages inline
 * "Press enter or click to view image in full size" and a "18 min read2 hours
 * ago" byline strip directly into the text, and both scored well enough to be
 * chosen as key points before this list caught them.
 */
const BOILERPLATE = [
  "continue reading on",
  "appeared first on",
  "read more",
  "subscribe",
  "sign up",
  "follow us",
  "originally published",
  "photo by",
  "image credit",
  "click here",
  "share this",
  "all rights reserved",
  "cookie",
  "newsletter",
  "press enter or click",
  "view image in full size",
  "min read",
  "listen to this story",
  "member-only story",
  "sign in to",
  "open in app",
];

/** Words too common to say anything about what a sentence is about. */
const STOPWORDS = new Set([
  "the", "and", "for", "that", "with", "this", "from", "you", "your", "are", "was", "were",
  "have", "has", "had", "not", "but", "can", "will", "how", "what", "when", "which", "they",
  "their", "its", "it", "is", "of", "to", "in", "on", "at", "by", "we", "our", "as", "an",
  "be", "or", "if", "a", "i", "us", "so", "do", "does", "did", "been", "more", "than", "then",
  "there", "these", "those", "also", "just", "about", "into", "over", "some", "any", "all",
]);

const MIN_SENTENCE_WORDS = 8;
const MAX_SENTENCE_WORDS = 60;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    // Readability often drops the space between a heading or caption and the
    // paragraph after it, producing "who verified the claim, and how?In
    // October 2025..." -- so a boundary is also punctuation followed straight
    // by a capital. The lookahead demands a following lower-case letter to
    // avoid splitting acronyms such as "U.S.A" or "GPT-4.O".
    .split(/(?<=[.!?])(?:\s+|(?=[A-Z][a-z]))(?=[A-Z0-9"'“])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9][a-z0-9'.+#-]*/g) ?? [];
}

function isBoilerplate(sentence: string): boolean {
  const lower = sentence.toLowerCase();
  return BOILERPLATE.some((marker) => lower.includes(marker));
}

/**
 * How often each meaningful word appears. A sentence built from words the
 * article keeps returning to is more likely to be about its subject than one
 * built from words used once.
 */
function termFrequency(sentences: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sentence of sentences) {
    for (const word of words(sentence)) {
      if (STOPWORDS.has(word) || word.length < 3) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

export interface KeyPointOptions {
  /** Topic aliases; a sentence naming the subject is worth more. */
  aliases?: string[];
  max?: number;
}

interface Scored {
  sentence: string;
  index: number;
  score: number;
}

/**
 * Returns up to `max` sentences in the order the article presents them, so the
 * result still reads as an argument rather than a pile of highlights.
 */
export function keyPoints(bodyText: string | null | undefined, options: KeyPointOptions = {}): string[] {
  const max = Math.max(1, Math.min(options.max ?? 4, 8));
  if (!bodyText) return [];

  const all = splitSentences(bodyText);
  const usable = all
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => {
      const count = words(sentence).length;
      if (count < MIN_SENTENCE_WORDS || count > MAX_SENTENCE_WORDS) return false;
      if (isBoilerplate(sentence)) return false;
      // A fragment that never terminates is usually a caption or a run-on left
      // behind by extraction, not a sentence the author wrote.
      if (!/[.!?]["'”’]?$/.test(sentence)) return false;
      // Digits glued to letters ("size18", "read2") are the signature of a UI
      // strip that lost its whitespace.
      return !/[a-z]\d|\d[a-z]{3,}/i.test(sentence.replace(/\d+(st|nd|rd|th|s)/gi, ""));
    });
  if (!usable.length) return [];

  const frequencies = termFrequency(usable.map((entry) => entry.sentence));
  const peak = Math.max(...frequencies.values(), 1);
  const aliases = (options.aliases ?? []).map((alias) => alias.toLowerCase());

  const scored: Scored[] = usable.map(({ sentence, index }) => {
    const tokens = words(sentence).filter((word) => !STOPWORDS.has(word) && word.length >= 3);
    const unique = [...new Set(tokens)];

    // Average normalised frequency, so a long sentence is not rewarded merely
    // for containing more words.
    const informativeness = unique.length
      ? unique.reduce((sum, word) => sum + (frequencies.get(word) ?? 0) / peak, 0) / unique.length
      : 0;

    // Openings carry the thesis; the tail is usually housekeeping.
    const position = 1 - index / all.length;

    const lower = sentence.toLowerCase();
    const namesSubject = aliases.some((alias) => lower.includes(alias)) ? 1 : 0;
    // Concrete numbers are what a reader actually wants out of a report.
    const hasFigure = /\d/.test(sentence) ? 1 : 0;

    const score = 0.4 * informativeness + 0.3 * position + 0.2 * namesSubject + 0.1 * hasFigure;
    return { sentence, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.sentence);
}

/** Convenience for callers that already have the item's topics. */
export function keyPointsForTopics(bodyText: string | null | undefined, topics: Interest[], max?: number): string[] {
  return keyPoints(bodyText, { aliases: topics, max });
}
