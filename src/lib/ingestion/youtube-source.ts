import "server-only";
import type { DiscoveryAdapter, DiscoveryHit } from "@/lib/ingestion/discovery";
import { fetchDiscoveryXml } from "@/lib/ingestion/discovery-fetch";
import type { IngestionSource } from "@/lib/ingestion/types";
import { channelIdFromFeedUrl, parseYouTubeFeed, youtubeEngagement, youtubeFeedUrl } from "@/lib/ingestion/youtube";

const DEFAULT_MIN_VIEWS = 2000;

/**
 * A channel feed carries the last 15 uploads with their view counts. No key and
 * no quota, which is why this is the channel feed rather than the Data API.
 */
async function fetchHits(source: IngestionSource): Promise<DiscoveryHit[]> {
  // The channel id lives in the stored feed URL, so a YouTube source is
  // configured the same way every other feed source is.
  const channelId = channelIdFromFeedUrl(source.feed_url);
  if (!channelId) throw new Error("INVALID_YOUTUBE_CHANNEL");

  const floor = source.min_engagement ?? DEFAULT_MIN_VIEWS;
  const videos = parseYouTubeFeed(await fetchDiscoveryXml(youtubeFeedUrl(channelId)));

  return videos.flatMap((video) => {
    const engagementCount = youtubeEngagement(video);
    // A brand-new upload has no views yet. The floor is what stops the feed
    // filling with a channel's every clip, and the next run will pick up
    // anything that goes on to earn an audience.
    if (engagementCount < floor) return [];
    return [{ candidate: video.candidate, engagementCount }];
  });
}

export const youtubeAdapter: DiscoveryAdapter = {
  platform: "youtube",
  fetchHits,
  // Scored as a video: the description is a caption for the artefact, so its
  // length says nothing about substance.
  kind: "video",
  // A YouTube watch page has no article to extract, and Readability on it
  // would return player chrome. The feed's description is what there is.
  enrichFromPage: false,
};
