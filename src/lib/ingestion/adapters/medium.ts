import Parser from "rss-parser";
import { BaseSourceAdapter, IngestionResult, RawContentItem } from "../types";
import { normalizeCanonicalUrl } from "../canonicalizer";

const parser = new Parser({
  headers: {
    "User-Agent": "MarkyMediumAdapter/1.0 (+https://marky-reader.com)",
  },
  timeout: 10000,
});

export class MediumAdapter implements BaseSourceAdapter {
  sourceType = "medium" as const;

  canHandle(url: string): boolean {
    return url.includes("medium.com") || url.includes("/@");
  }

  /**
   * Transforms a Medium user or publication URL into its canonical RSS feed URL.
   */
  getMediumFeedUrl(urlStr: string): string {
    if (urlStr.includes("/feed/")) return urlStr;

    try {
      const url = new URL(urlStr);
      const pathSegments = url.pathname.split("/").filter(Boolean);

      if (pathSegments.length > 0 && pathSegments[0].startsWith("@")) {
        // User feed: medium.com/feed/@username
        return `${url.origin}/feed/${pathSegments[0]}`;
      } else if (pathSegments.length > 0) {
        // Publication feed: medium.com/feed/publication-name
        return `${url.origin}/feed/${pathSegments[0]}`;
      }
    } catch {
      // Fallback
    }

    return urlStr;
  }

  async fetchFeed(feedOrSiteUrl: string, sourceId?: string): Promise<IngestionResult> {
    const feedUrl = this.getMediumFeedUrl(feedOrSiteUrl);

    try {
      const feed = await parser.parseURL(feedUrl);
      const items: RawContentItem[] = (feed.items || []).map((item) => {
        const rawLink = item.link || item.guid || feedOrSiteUrl;
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

        // Clean HTML tags from content snippet for readable summary
        const rawSnippet = item.contentSnippet || item.summary || "";
        const summary = rawSnippet.replace(/<[^>]*>?/gm, "").trim() || null;

        return {
          title: item.title?.trim() || "Medium Article",
          canonical_url: canonicalUrl,
          summary: summary,
          body_content: item.content || item["content:encoded"] || summary,
          author: item.creator || item.author || feed.title?.replace("Stories by ", "").replace(" – Medium", "") || "Medium Writer",
          published_at: publishedAt,
        };
      });

      return {
        success: true,
        source_id: sourceId,
        items,
      };
    } catch (error) {
      console.error(`Medium Ingestion error for ${feedOrSiteUrl}:`, error);
      return {
        success: false,
        source_id: sourceId,
        items: [],
        error: error instanceof Error ? error.message : "Failed to parse Medium content feed",
      };
    }
  }
}
