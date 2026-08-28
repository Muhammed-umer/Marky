export type SourceType = "rss" | "medium" | "x" | "web";

export interface Profile {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Interest {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
}

export interface UserInterest {
  user_id: string;
  interest_id: string;
  created_at: string;
}

export interface Source {
  id: string;
  title: string;
  source_type: SourceType;
  feed_url: string | null;
  site_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ContentItem {
  id: string;
  source_id: string | null;
  canonical_url: string;
  url_hash: string;
  title: string;
  summary: string | null;
  body_content: string | null;
  author: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ContentItemInterest {
  content_item_id: string;
  interest_id: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  content_item_id: string;
  is_read: boolean;
  saved_at: string;
}

// Joined Feed Item Model used for personalized Feed Rendering
export interface FeedItem extends ContentItem {
  source?: Source | null;
  interests?: Interest[];
  saved_item?: SavedItem | null;
  is_saved?: boolean;
  is_read?: boolean;
  score?: number;
}
