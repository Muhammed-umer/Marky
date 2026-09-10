export const interests = [
  "OpenAI",
  "Hugging Face",
  "NVIDIA",
  "Google / Google DeepMind",
  "Vercel",
  "Supabase",
  "Resend",
  "Next.js",
  "React",
  "TypeScript",
  "GitHub",
  "Neon",
] as const;

export type Interest = (typeof interests)[number];
export const topics = interests;
export type Topic = Interest;
export type FeedView = "for-you" | "trending" | "latest";

/**
 * Mirrors the sources.trust_tier check constraint. It lives here rather than in
 * the qualification module because the feed and ranking read it too; the
 * qualification module re-exports it so existing imports keep working.
 */
export type TrustTier = "official" | "community" | "probationary" | "unknown";

export function isValidAuthor(author: string | null | undefined): author is string {
  if (!author) return false;
  const trimmed = author.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  const invalidPlaceholders = new Set([
    "unknown author",
    "unknown",
    "n/a",
    "na",
    "anonymous",
    "—",
    "-",
    "undefined",
    "null",
  ]);
  return !invalidPlaceholders.has(lower);
}

export interface FeedItem {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  source: string;
  /**
   * How much the publisher is trusted, from sources.trust_tier. Optional so that
   * demo data and older callers keep working; absent is treated as "official",
   * which is also the column default.
   */
  trust?: TrustTier;
  author: string | null;
  publishedAt: string | null;
  imageUrl?: string | null;
  engagementCount?: number;
  /**
   * Words in the stored article body, from the database's generated column.
   * Null or absent means no body was extracted, in which case the UI omits the
   * reading time rather than estimating one.
   */
  wordCount?: number | null;
  interests: Interest[];
  sourceCount: number;
  saved: boolean;
  read: boolean;
  score?: number;
  explanation: string[];
}

