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
  author: string | null;
  publishedAt: string | null;
  imageUrl?: string | null;
  engagementCount?: number;
  interests: Interest[];
  sourceCount: number;
  saved: boolean;
  read: boolean;
  score?: number;
  explanation: string[];
}

