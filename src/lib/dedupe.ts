import { jaccard, NEAR_DUPLICATE_THRESHOLD, shingles } from "@/lib/qualification/reject";
import { isValidAuthor } from "@/lib/types";

/**
 * Near-duplicate detection over rows that are already stored.
 *
 * The ingestion gate rejects a near-duplicate before it is written
 * (`near_duplicate_title` in qualification/reject.ts), but it only ever saw
 * candidates from the generic RSS path, and only ever compared against the 500
 * most recent titles. Rows that predate the gate, or arrived through an adapter
 * that skipped it, are still stored. This module finds those groups so they can
 * be merged.
 *
 * Deliberately the same threshold and the same shingle/Jaccard pair the gate
 * uses: two stories that ingestion would have called duplicates must not be
 * called distinct here, or cleanup and prevention would disagree.
 */

export interface DedupeItem {
  id: string;
  title: string;
  canonicalUrl: string;
  bodyContent: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  fetchedAt: string | null;
}

export interface DuplicateGroup {
  keep: DedupeItem;
  remove: DedupeItem[];
}

/**
 * Publication dates further apart than this are treated as separate stories
 * even when their titles match exactly.
 *
 * This is the guard that makes deletion safe for recurring titles: a weekly
 * digest, a "Release notes" post or a changelog entry reuses its headline
 * verbatim every issue, and those are genuinely different articles. A real
 * syndicated duplicate shows up within days of the original, so the window
 * costs nothing that matters. Items with no date are never separated by it --
 * an unknown date is not evidence of distinctness.
 */
export const MAX_DUPLICATE_DAY_SPREAD = 7;

/** Words of body text that count as a full extraction rather than a teaser. */
const SUBSTANTIAL_BODY_WORDS = 150;

function bodyWordCount(body: string | null): number {
  return body ? (body.trim().match(/\S+/g) ?? []).length : 0;
}

/**
 * How well an item would render as a card, highest first. Mirrors what the feed
 * actually shows: body text, then an image, then a real byline. Keeping the
 * richest row is what stops a merge from degrading the feed -- the whole point
 * of preferring one row over another is that the survivor reads better.
 */
export function richness(item: DedupeItem): number {
  const words = bodyWordCount(item.bodyContent);
  const body = words >= SUBSTANTIAL_BODY_WORDS ? 4 : words > 0 ? 2 : 0;
  return body + (item.imageUrl ? 2 : 0) + (isValidAuthor(item.author) ? 1 : 0);
}

function timestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

/**
 * Ascending, unknown dates last. Subtracting the two directly would yield NaN
 * when both are unknown (Infinity - Infinity), and a comparator that returns
 * NaN makes Array.prototype.sort order-dependent -- which would let a dry run
 * name a different survivor than the run that actually deletes.
 */
function compareTimestamps(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * The survivor: richest card, then the earliest publication (the original
 * rather than the syndication), then the earliest row stored. `id` breaks the
 * final tie only so that repeated runs over unchanged data agree with
 * themselves -- a dry run must predict exactly what the real run will delete.
 */
export function chooseKeeper(items: DedupeItem[]): DedupeItem {
  return [...items].sort((left, right) => {
    const byRichness = richness(right) - richness(left);
    if (byRichness !== 0) return byRichness;
    const byPublished = compareTimestamps(timestamp(left.publishedAt), timestamp(right.publishedAt));
    if (byPublished !== 0) return byPublished;
    const byFetched = compareTimestamps(timestamp(left.fetchedAt), timestamp(right.fetchedAt));
    if (byFetched !== 0) return byFetched;
    return left.id < right.id ? -1 : 1;
  })[0];
}

/** True when two dates are far enough apart to be separate editions. */
function datesTooFarApart(left: DedupeItem, right: DedupeItem): boolean {
  const a = timestamp(left.publishedAt);
  const b = timestamp(right.publishedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) > MAX_DUPLICATE_DAY_SPREAD * 86_400_000;
}

export function isDuplicatePair(left: DedupeItem, right: DedupeItem, threshold = NEAR_DUPLICATE_THRESHOLD): boolean {
  if (datesTooFarApart(left, right)) return false;
  return jaccard(shingles(left.title), shingles(right.title)) > threshold;
}

/**
 * Groups near-duplicate items.
 *
 * Comparing every pair is O(n^2), which is real work at a few thousand rows, so
 * candidates are blocked by shared shingle first: two titles that share no
 * bigram cannot reach any threshold above zero, and are never compared. Matches
 * are then merged transitively through union-find, so a chain A~B~C becomes one
 * group with a single survivor rather than two overlapping pairs.
 */
export function findDuplicateGroups(items: DedupeItem[], threshold = NEAR_DUPLICATE_THRESHOLD): DuplicateGroup[] {
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let walk = index;
    while (parent[walk] !== walk) {
      const next = parent[walk];
      parent[walk] = root;
      walk = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const a = find(left);
    const b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };

  const byShingle = new Map<string, number[]>();
  const cached = items.map((item) => shingles(item.title));
  cached.forEach((set, index) => {
    for (const shingle of set) {
      const bucket = byShingle.get(shingle);
      if (bucket) bucket.push(index);
      else byShingle.set(shingle, [index]);
    }
  });

  const compared = new Set<string>();
  for (const bucket of byShingle.values()) {
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const left = bucket[i];
        const right = bucket[j];
        const key = `${left}:${right}`;
        if (compared.has(key)) continue;
        compared.add(key);
        if (find(left) === find(right)) continue;
        if (datesTooFarApart(items[left], items[right])) continue;
        if (jaccard(cached[left], cached[right]) > threshold) union(left, right);
      }
    }
  }

  const grouped = new Map<number, DedupeItem[]>();
  items.forEach((item, index) => {
    const root = find(index);
    const bucket = grouped.get(root);
    if (bucket) bucket.push(item);
    else grouped.set(root, [item]);
  });

  const groups: DuplicateGroup[] = [];
  for (const members of grouped.values()) {
    if (members.length < 2) continue;
    const keep = chooseKeeper(members);
    groups.push({ keep, remove: members.filter((member) => member.id !== keep.id) });
  }
  return groups;
}
