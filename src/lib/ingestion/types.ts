export type AutomatedSourceType = "medium_rss" | "rss";

export interface IngestionSource {
  id: string;
  name: string;
  source_type: string;
  feed_url: string | null;
  site_url: string | null;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at?: string | null;
  last_success_at?: string | null;
  last_error?: string | null;
  fetch_interval_minutes: number | null;
  max_article_age_days?: number | null;
}

export interface InterestRow {
  id: string;
  name: string;
}

export type TopicRow = InterestRow;

export interface SourceResult {
  sourceId: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  status: "succeeded" | "failed";
  errorCode?: string;
}
