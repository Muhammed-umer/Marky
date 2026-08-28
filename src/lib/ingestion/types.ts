import { SourceType } from "@/types/database";

export interface RawContentItem {
  title: string;
  canonical_url: string;
  summary: string | null;
  body_content: string | null;
  author: string | null;
  published_at: string | null;
}

export interface IngestionResult {
  success: boolean;
  source_id?: string;
  items: RawContentItem[];
  error?: string;
}

export interface BaseSourceAdapter {
  sourceType: SourceType;
  canHandle(url: string): boolean;
  fetchFeed(feedUrl: string, sourceId?: string): Promise<IngestionResult>;
}
