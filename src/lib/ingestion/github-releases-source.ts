import "server-only";
import type { DiscoveryAdapter, DiscoveryHit } from "@/lib/ingestion/discovery";
import { fetchDiscoveryJson } from "@/lib/ingestion/discovery-fetch";
import {
  candidateFromGitHubRelease,
  githubEngagement,
  githubReleasesUrl,
  isValidRepoSlug,
  type GitHubRelease,
} from "@/lib/ingestion/github-releases";
import type { IngestionSource } from "@/lib/ingestion/types";

const PER_PAGE = 10;

/**
 * GitHub wants an explicit API version and rejects requests without an Accept
 * it recognises.
 */
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

/**
 * Releases are ordered newest first by the API, and the runner applies the age
 * window, so no floor is needed here -- a release is news because it shipped,
 * not because anyone reacted to it. That is also why `min_engagement` is not
 * consulted: gating releases on reactions would hide most of them, since
 * GitHub reports none for the majority.
 */
async function fetchHits(source: IngestionSource): Promise<DiscoveryHit[]> {
  const slug = source.discovery_query?.trim();
  if (!slug) throw new Error("MISSING_DISCOVERY_QUERY");
  if (!isValidRepoSlug(slug)) throw new Error("INVALID_REPO_SLUG");

  const releases = await fetchDiscoveryJson<GitHubRelease[]>(githubReleasesUrl(slug, PER_PAGE), GITHUB_HEADERS);
  if (!Array.isArray(releases)) throw new Error("UNEXPECTED_RESPONSE_SHAPE");

  return releases.flatMap((release) => {
    const candidate = candidateFromGitHubRelease(slug, release);
    return candidate ? [{ candidate, engagementCount: githubEngagement(release) }] : [];
  });
}

export const githubReleasesAdapter: DiscoveryAdapter = {
  platform: "github",
  fetchHits,
  // The release notes are the article. Fetching the release page would return
  // the same text wrapped in GitHub's chrome.
  enrichFromPage: false,
  // 60 requests per hour per IP unauthenticated, shared across every repo.
  quota: "github",
};
