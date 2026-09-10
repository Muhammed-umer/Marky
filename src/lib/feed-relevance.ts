import { interestKeywords } from "@/lib/ingestion/classify";
import { interests, type FeedItem, type Interest } from "@/lib/types";

/**
 * Why a second relevance pass exists at read time.
 *
 * `content_item_topics` records every topic a story *mentions*: classification
 * keeps its top 3 keyword matches, so an article about NVIDIA's moat that says
 * "OpenAI" once is stored under both. The feed query then treats those links as
 * equal, and a reader following only OpenAI is handed the NVIDIA piece.
 *
 * The link table has no confidence or primary-topic column, so the ordering has
 * to be recovered from the text. `classifyContent` is deterministic and pure,
 * so recomputing it here gives the same answer ingestion got, and costs a
 * string scan per item.
 */

/**
 * The topics a story is actually *about*: the highest-confidence matches, ties
 * included. Empty when title and summary carry no keyword at all -- which
 * happens for items whose stored topics came from body text or from
 * `source_topics` rather than from the headline.
 */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * A headline mention is worth three in the summary: what a story is about is
 * what its title says it is about. `classifyContent` cannot be reused directly
 * -- it scores a topic by how many of its keywords appear, not how often, so a
 * piece titled for NVIDIA that says "OpenAI" once ties the two.
 */
function mentionWeight(name: Interest, title: string, summary: string | null): number {
  const heading = title.toLowerCase();
  const body = (summary ?? "").toLowerCase();
  return interestKeywords[name].reduce(
    (total, keyword) => total + occurrences(heading, keyword) * 3 + occurrences(body, keyword),
    0,
  );
}

/**
 * The topics a story is actually *about*: the most-weighted mentions, ties
 * included. Empty when title and summary carry no keyword at all -- which
 * happens for items whose stored topics came from body text or from
 * `source_topics` rather than from the headline.
 */
export function leadingInterests(title: string, summary: string | null): Interest[] {
  const weighted = interests.map((name) => ({ name, weight: mentionWeight(name, title, summary) })).filter((entry) => entry.weight > 0);
  if (!weighted.length) return [];
  const best = Math.max(...weighted.map((entry) => entry.weight));
  return weighted.filter((entry) => entry.weight >= best).map((entry) => entry.name);
}

type RelevanceInput = Pick<FeedItem, "title" | "excerpt" | "interests">;

/**
 * True when a selected topic is what the story leads with, rather than one it
 * merely name-drops. With no keyword evidence in the headline or summary we
 * fall back to the stored links: dropping those items would silently hide
 * everything classified from body text.
 */
export function matchesSelectedInterests(item: RelevanceInput, selected: Interest[]): boolean {
  if (!selected.length) return true;
  const wanted = new Set(selected);
  const leading = leadingInterests(item.title, item.excerpt);
  const candidates = leading.length ? leading : item.interests;
  return candidates.some((interest) => wanted.has(interest));
}

/**
 * Puts the reader's own topics first so the card's pill and its "Matches X"
 * explanation name the topic they follow, not whichever link happened to be
 * stored first.
 */
export function orderInterestsBySelection(itemInterests: Interest[], selected: Interest[]): Interest[] {
  const wanted = new Set(selected);
  return [...itemInterests.filter((i) => wanted.has(i)), ...itemInterests.filter((i) => !wanted.has(i))];
}
