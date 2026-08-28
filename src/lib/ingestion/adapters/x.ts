import { BaseSourceAdapter, IngestionResult, RawContentItem } from "../types";
import { normalizeCanonicalUrl } from "../canonicalizer";

export class XAdapter implements BaseSourceAdapter {
  sourceType = "x" as const;

  canHandle(url: string): boolean {
    return url.includes("x.com/") || url.includes("twitter.com/");
  }

  /**
   * Extracts username handle and status ID from an X/Twitter URL.
   */
  parseXUrl(urlStr: string): { handle: string; statusId: string } | null {
    try {
      const url = new URL(urlStr);
      const parts = url.pathname.split("/").filter(Boolean);

      if (parts.length >= 3 && parts[1] === "status") {
        return {
          handle: `@${parts[0]}`,
          statusId: parts[2],
        };
      }
    } catch {
      // Fallback
    }

    return null;
  }

  async fetchFeed(urlStr: string, sourceId?: string): Promise<IngestionResult> {
    const canonicalUrl = normalizeCanonicalUrl(urlStr);
    const parsed = this.parseXUrl(canonicalUrl);

    const handle = parsed?.handle || "X/Twitter User";
    const statusId = parsed?.statusId ? ` (${parsed.statusId})` : "";
    const title = `Post by ${handle}${statusId}`;

    const items: RawContentItem[] = [
      {
        title,
        canonical_url: canonicalUrl,
        summary: `Permitted X/Twitter content link from ${handle}. Click original link to view thread.`,
        body_content: `Permitted extraction reference for ${canonicalUrl}. Sourced from originator ${handle}.`,
        author: handle,
        published_at: new Date().toISOString(), // Fallback timestamp recorded
      },
    ];

    return {
      success: true,
      source_id: sourceId,
      items,
    };
  }
}
