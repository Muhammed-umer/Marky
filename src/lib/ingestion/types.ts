export type AutomatedSourceType = "medium_rss" | "rss";

export interface IngestionSource {
  id: string;
  name: string;
  source_type: AutomatedSourceType;
  feed_url: string | null;
  site_url: string;
  etag: string | null;
  last_modified: string | null;
  last_successful_fetch: string | null;
  fetch_interval_minutes: number;
}

export interface InterestRow {
  id: string;
  name: string;
}

export interface SourceResult {
  sourceId: string;
  fetched: number;
  inserted: number;
  duplicates: number;
  status: "succeeded" | "failed";
  errorCode?: string;
}
