export const interests = [
  "Artificial Intelligence",
  "Programming",
  "Software Engineering",
  "Cybersecurity",
  "Startups",
  "Cloud Computing",
  "Data Science",
  "Developer Tools",
] as const;

export type Interest = (typeof interests)[number];
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
