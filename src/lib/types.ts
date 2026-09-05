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

export interface FeedItem {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  source: string;
  author: string;
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
