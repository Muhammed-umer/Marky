export type AutomatedSourceType =
  | "medium_rss"
  | "rss"
  | "hacker_news"
  | "dev_to"
  | "stack_exchange"
  | "github_releases"
  | "youtube";

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
  trust_tier?: string | null;
  /**
   * What a discovery source searches for. Its meaning is per platform: a search
   * term on Hacker News, a tag on DEV.to and Stack Exchange, an `owner/repo`
   * slug for GitHub releases. YouTube reads its channel from `feed_url`, and
   * Stack Exchange reads its site slug from `site_url`. Unused by feed adapters.
   */
  discovery_query?: string | null;
  /** Minimum reported reactions before a discovery source will consider an item. */
  min_engagement?: number | null;
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
  rejected: number;
  status: "succeeded" | "failed";
  errorCode?: string;
}
