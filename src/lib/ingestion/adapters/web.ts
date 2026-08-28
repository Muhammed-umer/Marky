import { BaseSourceAdapter, IngestionResult, RawContentItem } from "../types";
import { normalizeCanonicalUrl } from "../canonicalizer";

export class WebAdapter implements BaseSourceAdapter {
  sourceType = "web" as const;

  canHandle(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  async fetchFeed(urlStr: string, sourceId?: string): Promise<IngestionResult> {
    const canonicalUrl = normalizeCanonicalUrl(urlStr);

    try {
      const response = await fetch(canonicalUrl, {
        headers: {
          "User-Agent": "MarkyWebExtractor/1.0 (+https://marky-reader.com)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      // Extract metadata using regex patterns
      const titleMatch =
        html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : "Saved Web Content";

      const descMatch =
        html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
      const summary = descMatch ? descMatch[1].trim() : null;

      const authorMatch =
        html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i) ||
        html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
      const author = authorMatch ? authorMatch[1].trim() : new URL(canonicalUrl).hostname;

      const pubTimeMatch = html.match(/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i);
      let publishedAt: string | null = null;
      if (pubTimeMatch) {
        try {
          publishedAt = new Date(pubTimeMatch[1]).toISOString();
        } catch {
          publishedAt = null;
        }
      }

      // Basic article body extraction snippet
      const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      const rawBody = bodyMatch ? bodyMatch[1] : summary || title;

      const item: RawContentItem = {
        title,
        canonical_url: canonicalUrl,
        summary,
        body_content: rawBody,
        author,
        published_at: publishedAt,
      };

      return {
        success: true,
        source_id: sourceId,
        items: [item],
      };
    } catch (error) {
      console.error(`Web Extraction error for ${urlStr}:`, error);

      // Fallback: retains original URL integrity and hostname author without hallucinated details
      const fallbackItem: RawContentItem = {
        title: `Submitted URL: ${new URL(canonicalUrl).hostname}`,
        canonical_url: canonicalUrl,
        summary: `Submitted web content link. Click original URL to view.`,
        body_content: null,
        author: new URL(canonicalUrl).hostname,
        published_at: null,
      };

      return {
        success: true,
        source_id: sourceId,
        items: [fallbackItem],
      };
    }
  }
}
