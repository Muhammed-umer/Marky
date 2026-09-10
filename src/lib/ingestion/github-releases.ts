import { stripMarkup, type RssCandidate } from "@/lib/ingestion/rss";
import { canonicalizeUrl } from "@/lib/url";

/**
 * GitHub releases via the REST API. No key, but 60 requests per hour per IP
 * unauthenticated across every repository, so these sources go through the
 * quota ledger (src/lib/ingestion/quota.ts) and run hourly at most.
 *
 * A release is the one kind of item where the project itself is the author and
 * the notes are the article. Nothing is extracted from a page: the API returns
 * the body, which is what a reader wants.
 */
export const GITHUB_API_ROOT = "https://api.github.com";

export interface GitHubRelease {
  id: number | null;
  name: string | null;
  tag_name: string | null;
  html_url: string | null;
  body: string | null;
  published_at: string | null;
  created_at: string | null;
  draft: boolean | null;
  prerelease: boolean | null;
  author?: { login?: string | null } | null;
  reactions?: { total_count?: number | null } | null;
}

/** `owner/repo`, the only shape the releases endpoint accepts. */
export function isValidRepoSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(slug.trim());
}

export function githubReleasesUrl(slug: string, perPage: number): string {
  const params = new URLSearchParams({ per_page: String(Math.min(Math.max(1, perPage), 100)) });
  return `${GITHUB_API_ROOT}/repos/${slug.trim()}/releases?${params.toString()}`;
}

/**
 * A draft is not published and a prerelease is not news for a reader, so both
 * are dropped before anything else looks at them.
 */
export function isPublishedRelease(release: GitHubRelease): boolean {
  return !release.draft && !release.prerelease && Boolean(release.published_at);
}

/**
 * The title is the release name when the project wrote one, and the tag
 * otherwise -- many projects leave `name` empty and let the tag speak.
 *
 * `author` is the login of whoever cut the release, which is a person but not
 * the author of the software. It is left null for the same reason the Hacker
 * News adapter drops submitters: a plausible-looking wrong byline is worse
 * than an honest missing one.
 */
export function candidateFromGitHubRelease(slug: string, release: GitHubRelease): RssCandidate | null {
  if (!release.html_url || !isPublishedRelease(release)) return null;
  const repo = slug.trim();
  const label = release.name?.trim() || release.tag_name?.trim();
  if (!label) return null;
  // "vercel/next.js" plus "v16.0.0" reads as a headline; the tag alone does not
  // say what shipped, and the feed shows titles without their source.
  const title = label.toLowerCase().includes(repo.split("/")[1].toLowerCase()) ? label : `${repo} ${label}`;
  try {
    return {
      externalId: release.id == null ? null : `ghrel:${release.id}`,
      canonicalUrl: canonicalizeUrl(release.html_url),
      title: title.slice(0, 500),
      author: null,
      summary: stripMarkup(release.body, 400),
      bodyText: stripMarkup(release.body),
      publishedAt: release.published_at ?? release.created_at,
      imageUrl: null,
    };
  } catch {
    return null;
  }
}

/**
 * Reactions on the release itself. GitHub reports none for most releases, and
 * a reported zero is a real zero rather than an absence -- which is the
 * distinction `engagementCount: null` exists for elsewhere.
 */
export function githubEngagement(release: GitHubRelease): number {
  return Math.max(0, release.reactions?.total_count ?? 0);
}
