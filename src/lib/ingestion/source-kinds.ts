/**
 * Which cron job owns which kind of source.
 *
 * Feed sources publish their own work: one fetch and a parse. Discovery sources
 * report what other people reacted to, and hand over a link and a score rather
 * than the article, so each run also fetches up to a dozen article pages. The
 * two are split across separate cron jobs because one 60-second budget cannot
 * hold both once there are 62 sources.
 *
 * Every type the schema allows must appear in exactly one set. A type in
 * neither would be ingested by no cron at all, and would fail silently -- the
 * sources would simply never come due.
 */
export const FEED_SOURCE_TYPES = ["rss", "atom", "medium_rss", "api", "web", "platform"] as const;

export const DISCOVERY_SOURCE_TYPES = [
  "hacker_news",
  "dev_to",
  "stack_exchange",
  "github_releases",
  "youtube",
] as const;

export type IngestKind = "feeds" | "discovery" | "all";

export function matchesKind(sourceType: string, kind: IngestKind): boolean {
  if (kind === "feeds") return (FEED_SOURCE_TYPES as readonly string[]).includes(sourceType);
  if (kind === "discovery") return (DISCOVERY_SOURCE_TYPES as readonly string[]).includes(sourceType);
  return true;
}

export function parseIngestKind(value: string | null): IngestKind {
  // Anything unrecognised falls back to "all", so a malformed cron call still
  // ingests rather than silently doing nothing.
  return value === "feeds" || value === "discovery" ? value : "all";
}
