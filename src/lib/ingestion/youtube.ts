import { XMLParser } from "fast-xml-parser";
import { safeImageUrl, stripMarkup, type RssCandidate } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * YouTube channel uploads via the public channel feed. No key, no quota, no
 * API console -- the Data API costs a project and a key for the same data.
 *
 * The generic RSS adapter would parse the entries but drop what makes this
 * source worth having: `media:community` carries view and rating counts, which
 * is a real reported reaction. So this module parses the same Atom document
 * with the statistics kept.
 */
export const YOUTUBE_FEED_ENDPOINT = "https://www.youtube.com/feeds/videos.xml";

/** Channel ids are the `UC…` form; a handle or a name will not work here. */
export function isValidChannelId(channelId: string): boolean {
  return /^UC[A-Za-z0-9_-]{22}$/.test(channelId.trim());
}

export function youtubeFeedUrl(channelId: string): string {
  return `${YOUTUBE_FEED_ENDPOINT}?channel_id=${encodeURIComponent(channelId.trim())}`;
}

/**
 * The channel id a source watches, read from its stored feed URL so no column
 * has to be added for it.
 */
export function channelIdFromFeedUrl(feedUrl: string | null): string | null {
  if (!feedUrl) return null;
  try {
    const url = new URL(feedUrl);
    if (url.hostname.toLowerCase().replace(/^www\./, "") !== "youtube.com") return null;
    const channelId = url.searchParams.get("channel_id");
    return channelId && isValidChannelId(channelId) ? channelId : null;
  } catch {
    return null;
  }
}

export interface YouTubeVideo {
  candidate: RssCandidate;
  views: number;
  likes: number;
}

// removeNSPrefix collapses yt:videoId to videoId and media:group to group,
// which is what the feed parser already does for every other source.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  const record = asRecord(value);
  const inner = record?.["#text"];
  return typeof inner === "string" || typeof inner === "number" ? String(inner).trim() : "";
}

function asCount(value: unknown): number {
  const parsed = Number(asText(value));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Parses a channel feed into videos with their reported statistics.
 *
 * A video with no description is kept rather than dropped: the qualification
 * gate decides whether it has enough substance, and that decision belongs in
 * one place.
 */
export function parseYouTubeFeed(xml: string): YouTubeVideo[] {
  const document = parser.parse(xml) as Record<string, unknown>;
  const feed = asRecord(document.feed);
  if (!feed) return [];

  return asArray(feed.entry).flatMap((raw) => {
    const entry = asRecord(raw);
    if (!entry) return [];

    const videoId = asText(entry.videoId);
    const title = asText(entry.title);
    const link = asRecord(asArray(entry.link)[0]);
    const href = typeof link?.["@_href"] === "string" ? link["@_href"] : "";
    // The canonical watch URL, rebuilt rather than trusted: the feed's link is
    // already that, but a video id is the thing we actually know.
    const target = videoId ? `https://www.youtube.com/watch?v=${videoId}` : href;
    if (!title || !target) return [];

    const group = asRecord(entry.group);
    const community = asRecord(group?.community);
    const statistics = asRecord(community?.statistics);
    const starRating = asRecord(community?.starRating);
    const thumbnail = asRecord(group?.thumbnail);
    const thumbnailUrl = typeof thumbnail?.["@_url"] === "string" ? thumbnail["@_url"] : "";

    try {
      return [
        {
          candidate: {
            externalId: videoId ? `yt:${videoId}` : null,
            canonicalUrl: canonicalizeUrl(target),
            title: title.slice(0, 500),
            // The channel published it, and the feed says so.
            author: asText(asRecord(entry.author)?.name) || null,
            summary: stripMarkup(asText(group?.description), 400),
            bodyText: stripMarkup(asText(group?.description)),
            publishedAt: asText(entry.published) || null,
            imageUrl: thumbnailUrl ? safeImageUrl(thumbnailUrl) : null,
          },
          views: asCount(statistics?.["@_views"]),
          likes: asCount(starRating?.["@_count"]),
        },
      ];
    } catch {
      return [];
    }
  });
}

/**
 * Views, the number the scorer normalises against YouTube's scale. Likes are
 * added because they are a stronger signal than a view, but views dominate by
 * orders of magnitude and that is the honest shape of the platform.
 */
export function youtubeEngagement(video: YouTubeVideo): number {
  return video.views + video.likes;
}
