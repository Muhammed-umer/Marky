import { BaseSourceAdapter, IngestionResult } from "./types";
import { RssAdapter } from "./adapters/rss";
import { MediumAdapter } from "./adapters/medium";
import { XAdapter } from "./adapters/x";
import { WebAdapter } from "./adapters/web";
import { generateUrlHash } from "./canonicalizer";
import { validateContentItem } from "./validator";
import { getAdminSupabase } from "@/lib/supabase/server";

export class IngestionController {
  private adapters: BaseSourceAdapter[] = [];

  constructor() {
    this.registerAdapter(new RssAdapter());
    this.registerAdapter(new MediumAdapter());
    this.registerAdapter(new XAdapter());
    this.registerAdapter(new WebAdapter());
  }

  registerAdapter(adapter: BaseSourceAdapter) {
    this.adapters.push(adapter);
  }

  getAdapterForUrl(url: string): BaseSourceAdapter {
    const match = this.adapters.find((a) => a.canHandle(url));
    return match || this.adapters[0]; // Fallback to RSS adapter
  }

  /**
   * Ingests a content source with exponential backoff retry.
   */
  async processSource(
    feedUrl: string,
    sourceId?: string,
    maxRetries = 3
  ): Promise<{ inserted: number; skipped: number; error?: string }> {
    const adapter = this.getAdapterForUrl(feedUrl);
    let attempt = 0;
    let result: IngestionResult | null = null;

    while (attempt < maxRetries) {
      attempt++;
      try {
        result = await adapter.fetchFeed(feedUrl, sourceId);
        if (result.success) break;
      } catch (err) {
        console.warn(`Ingestion attempt ${attempt} failed for ${feedUrl}:`, err);
      }

      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const backoffMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((res) => setTimeout(res, backoffMs));
      }
    }

    if (!result || !result.success || result.items.length === 0) {
      return {
        inserted: 0,
        skipped: 0,
        error: result?.error || `Failed to fetch feed after ${maxRetries} attempts`,
      };
    }

    const supabase = getAdminSupabase();
    let inserted = 0;
    let skipped = 0;

    for (const rawItem of result.items) {
      // Validate schema and sanitize untrusted HTML input
      const validation = validateContentItem(rawItem);
      if (!validation.valid || !validation.sanitizedItem) {
        skipped++;
        continue;
      }

      const item = validation.sanitizedItem;
      const urlHash = generateUrlHash(item.canonical_url);

      // Deduplication check by url_hash
      const { data: existing } = await supabase
        .from("content_items")
        .select("id")
        .eq("url_hash", urlHash)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Insert validated item into DB
      const { error: insertErr } = await supabase.from("content_items").insert({
        source_id: sourceId || null,
        canonical_url: item.canonical_url,
        url_hash: urlHash,
        title: item.title,
        summary: item.summary,
        body_content: item.body_content,
        author: item.author || "Unknown Author",
        published_at: item.published_at,
      });

      if (!insertErr) {
        inserted++;
      } else {
        console.error("DB Insert Error for content item:", insertErr);
        skipped++;
      }
    }

    return { inserted, skipped };
  }
}
