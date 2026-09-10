import { orderInterestsBySelection } from "@/lib/feed-relevance";
import { interests, isValidAuthor, type FeedItem, type Interest, type TrustTier } from "@/lib/types";

/**
 * The one definition of how a content_items row becomes a FeedItem.
 *
 * It is shared because more than one route hands items to the dashboard: the
 * feed, and the submission poller that shows a pasted link the moment it
 * finishes. When each built its own shape they drifted, and the dashboard
 * silently rendered items missing fields the UI relies on.
 */
export const CONTENT_ITEM_SELECTION =
  "id,title,summary,canonical_url,author,published_at,image_url,word_count,source:sources(name,trust_tier),content_item_topics(topic:topics(name)),signals:content_item_signals(engagement_count,source_count)";

/** PostgREST returns an embedded row as either an object or a one-element array. */
export function relation<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : (value ?? undefined);
}

export function relationName(value: { name: string } | Array<{ name: string }> | null | undefined) {
  return relation(value)?.name;
}

const TRUST_TIERS = new Set<TrustTier>(["official", "community", "probationary", "unknown"]);

/** Absent or unrecognised means the column default, which is 'official'. */
export function asTrustTier(value: unknown): TrustTier {
  return typeof value === "string" && TRUST_TIERS.has(value as TrustTier) ? (value as TrustTier) : "official";
}

export interface ContentItemRow {
  id: string;
  title: string;
  summary: string | null;
  canonical_url: string;
  author: string | null;
  published_at: string | null;
  image_url: string | null;
  is_hidden?: boolean | null;
  word_count?: unknown;
  source?: unknown;
  content_item_topics?: Array<{ topic: { name: string } | Array<{ name: string }> | null }> | null;
  signals?: unknown;
}

export function toFeedItem(row: ContentItemRow, state: { saved: boolean; read: boolean; selected?: Interest[] }): FeedItem {
  const storedInterests = (row.content_item_topics ?? []).flatMap((link) => {
    const name = relationName(link.topic);
    return interests.includes(name as Interest) ? [name as Interest] : [];
  });
  // The reader's own topics lead, so the card's pill and explanation name the
  // topic they follow rather than whichever link was stored first.
  const itemInterests = orderInterestsBySelection(storedInterests, state.selected ?? []);
  // Only what a source actually reported: absent signals stay 0 / 1.
  const signals = relation(row.signals as { engagement_count?: number; source_count?: number } | Array<{ engagement_count?: number; source_count?: number }>);
  const source = relation(row.source as { name?: string; trust_tier?: unknown } | Array<{ name?: string; trust_tier?: unknown }>);

  return {
    id: row.id,
    title: row.title,
    excerpt: row.summary ?? "Open the original source to read this story.",
    url: row.canonical_url,
    source: source?.name ?? new URL(row.canonical_url).hostname,
    trust: asTrustTier(source?.trust_tier),
    author: row.author && isValidAuthor(row.author) ? row.author : null,
    publishedAt: row.published_at,
    imageUrl: row.image_url,
    engagementCount: signals?.engagement_count ?? 0,
    wordCount: typeof row.word_count === "number" ? row.word_count : null,
    interests: itemInterests,
    sourceCount: signals?.source_count ?? 1,
    saved: state.saved,
    read: state.read,
    explanation: [itemInterests[0] ? `Matches ${itemInterests[0]}` : "Technology source", "From a tracked source"],
  };
}
