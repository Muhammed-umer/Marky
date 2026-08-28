import Parser from "rss-parser";
import { BaseSourceAdapter, IngestionResult, RawContentItem } from "../types";
import { normalizeCanonicalUrl } from "../canonicalizer";

const parser = new Parser({
  headers: {
    "User-Agent": "MarkyContentIngestion/1.0 (+https://marky-reader.com)",
  },
  timeout: 10000,
});

export class RssAdapter implements BaseSourceAdapter {
  sourceType = "rss" as const;

  canHandle(url: string): boolean {
    return (
      url.includes("/rss") ||
      url.includes("/feed") ||
      url.endsWith(".xml") ||
      url.endsWith(".rss") ||
      url.endsWith(".atom")
    );
  }

  async fetchFeed(feedUrl: string, sourceId?: string): Promise<IngestionResult> {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items: RawContentItem[] = (feed.items || []).map((item) => {
        const rawLink = item.link || item.guid || feedUrl;
        const canonicalUrl = normalizeCanonicalUrl(rawLink);

        let publishedAt: string | null = null;
        if (item.isoDate) {
          publishedAt = item.isoDate;
        } else if (item.pubDate) {
          try {
            publishedAt = new Date(item.pubDate).toISOString();
          } catch {
            publishedAt = null;
          }
        }

        return {
          title: item.title?.trim() || "Untitled RSS Post",
          canonical_url: canonicalUrl,
          summary: item.contentSnippet || item.summary || null,
          body_content: item.content || item["content:encoded"] || item.contentSnippet || null,
          author: item.creator || item.author || feed.title || null,
          published_at: publishedAt,
        };
      });

      return {
        success: true,
        source_id: sourceId,
        items,
      };
    } catch (error) {
      console.error(`RSS Ingestion error for ${feedUrl}:`, error);
      return {
        success: false,
        source_id: sourceId,
        items: [],
        error: error instanceof Error ? error.message : "Failed to parse RSS feed",
      };
    }
  }
}
