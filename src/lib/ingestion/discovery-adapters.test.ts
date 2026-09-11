import { describe, expect, it } from "vitest";
import {
  candidateFromDevToArticle,
  devToEngagement,
  devToSearchUrl,
  isValidDevToTag,
  type DevToArticle,
} from "@/lib/ingestion/dev-to";
import {
  candidateFromGitHubRelease,
  githubEngagement,
  githubReleasesUrl,
  isPublishedRelease,
  isValidRepoSlug,
  type GitHubRelease,
} from "@/lib/ingestion/github-releases";
import {
  candidateFromStackExchangeQuestion,
  stackExchangeEngagement,
  stackExchangeSearchUrl,
  stackExchangeSiteFromUrl,
  type StackExchangeQuestion,
} from "@/lib/ingestion/stack-exchange";
import { channelIdFromFeedUrl, isValidChannelId, parseYouTubeFeed, youtubeEngagement } from "@/lib/ingestion/youtube";

describe("dev.to", () => {
  const article = (overrides: Partial<DevToArticle> = {}): DevToArticle => ({
    id: 1,
    title: "Server components, explained",
    description: "A walkthrough.",
    url: "https://dev.to/someone/server-components-explained-1a2b",
    canonical_url: null,
    cover_image: "https://media.dev.to/cover.png",
    social_image: null,
    published_at: "2026-09-01T00:00:00Z",
    positive_reactions_count: 40,
    comments_count: 5,
    reading_time_minutes: 6,
    user: { name: "Ada Lovelace", username: "ada" },
    ...overrides,
  });

  it("restricts the search to one tag and caps the page size", () => {
    const url = new URL(devToSearchUrl("React", 30, 500));
    expect(url.searchParams.get("tag")).toBe("react");
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("accepts only a bare tag token", () => {
    expect(isValidDevToTag("nextjs")).toBe(true);
    expect(isValidDevToTag("next.js")).toBe(false);
    expect(isValidDevToTag("machine learning")).toBe(false);
  });

  it("keeps the author, who really did write the post", () => {
    expect(candidateFromDevToArticle(article())?.author).toBe("Ada Lovelace");
  });

  it("prefers the original over DEV's copy when the post was cross-posted", () => {
    const candidate = candidateFromDevToArticle(article({ canonical_url: "https://ada.dev/blog/server-components" }));
    expect(candidate?.canonicalUrl).toContain("ada.dev");
  });

  it("falls back to the social image when there is no cover", () => {
    const candidate = candidateFromDevToArticle(article({ cover_image: null, social_image: "https://media.dev.to/social.png" }));
    expect(candidate?.imageUrl).toBe("https://media.dev.to/social.png");
  });

  it("drops an article with no title or no link", () => {
    expect(candidateFromDevToArticle(article({ title: null }))).toBeNull();
    expect(candidateFromDevToArticle(article({ url: null }))).toBeNull();
  });

  it("counts reactions and comments together", () => {
    expect(devToEngagement(article())).toBe(45);
    expect(devToEngagement(article({ positive_reactions_count: null, comments_count: null }))).toBe(0);
  });
});

describe("stack exchange", () => {
  const question = (overrides: Partial<StackExchangeQuestion> = {}): StackExchangeQuestion => ({
    question_id: 77,
    title: "Why does useEffect run twice?",
    link: "https://stackoverflow.com/questions/77/why-does-useeffect-run-twice",
    score: 30,
    answer_count: 4,
    is_answered: true,
    creation_date: Date.parse("2026-09-01T00:00:00Z") / 1000,
    last_activity_date: Date.parse("2026-09-02T00:00:00Z") / 1000,
    body: "<p>In <code>StrictMode</code> the effect is invoked twice.</p>",
    owner: { display_name: "asker" },
    ...overrides,
  });

  it("reads the site slug from the source's site URL", () => {
    expect(stackExchangeSiteFromUrl("https://stackoverflow.com")).toBe("stackoverflow");
    expect(stackExchangeSiteFromUrl("https://dba.stackexchange.com")).toBe("dba");
    expect(stackExchangeSiteFromUrl("https://example.com")).toBeNull();
    expect(stackExchangeSiteFromUrl(null)).toBeNull();
  });

  it("asks only for answered questions above a score, sorted by votes", () => {
    const url = new URL(stackExchangeSearchUrl("stackoverflow", "React", 5, 25));
    expect(url.searchParams.get("tagged")).toBe("react");
    expect(url.searchParams.get("answers")).toBe("1");
    expect(url.searchParams.get("sort")).toBe("votes");
    expect(url.searchParams.get("min")).toBe("5");
    expect(url.searchParams.get("filter")).toBe("withbody");
  });

  it("sends the date window as a unix timestamp", () => {
    const from = new Date("2026-09-01T00:00:00Z");
    const url = new URL(stackExchangeSearchUrl("stackoverflow", "react", 5, 25, from));
    expect(url.searchParams.get("fromdate")).toBe(String(from.getTime() / 1000));
  });

  it("turns the HTML body into text and the epoch into a date", () => {
    const candidate = candidateFromStackExchangeQuestion(question());
    expect(candidate?.bodyText).toBe("In StrictMode the effect is invoked twice.");
    expect(candidate?.publishedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("leaves the author null rather than crediting the asker for an answer", () => {
    expect(candidateFromStackExchangeQuestion(question())?.author).toBeNull();
  });

  it("counts score and answers together", () => {
    expect(stackExchangeEngagement(question())).toBe(34);
  });
});

describe("github releases", () => {
  const release = (overrides: Partial<GitHubRelease> = {}): GitHubRelease => ({
    id: 900,
    name: "v16.0.0",
    tag_name: "v16.0.0",
    html_url: "https://github.com/vercel/next.js/releases/tag/v16.0.0",
    body: "## Highlights\n\nTurbopack is now the default bundler for `next build`.",
    published_at: "2026-09-01T00:00:00Z",
    created_at: "2026-08-31T00:00:00Z",
    draft: false,
    prerelease: false,
    author: { login: "octocat" },
    reactions: { total_count: 120 },
    ...overrides,
  });

  it("accepts only an owner/repo slug", () => {
    expect(isValidRepoSlug("vercel/next.js")).toBe(true);
    expect(isValidRepoSlug("next.js")).toBe(false);
    expect(isValidRepoSlug("vercel/next.js/releases")).toBe(false);
  });

  it("caps the page size", () => {
    expect(new URL(githubReleasesUrl("vercel/next.js", 500)).searchParams.get("per_page")).toBe("100");
  });

  it("skips drafts and prereleases", () => {
    expect(isPublishedRelease(release())).toBe(true);
    expect(isPublishedRelease(release({ draft: true }))).toBe(false);
    expect(isPublishedRelease(release({ prerelease: true }))).toBe(false);
    expect(candidateFromGitHubRelease("vercel/next.js", release({ draft: true }))).toBeNull();
  });

  it("names the repository in the title when the tag alone would not say what shipped", () => {
    expect(candidateFromGitHubRelease("vercel/next.js", release({ name: "v16.0.0" }))?.title).toBe("vercel/next.js v16.0.0");
    expect(candidateFromGitHubRelease("vercel/next.js", release({ name: "Next.js 16" }))?.title).toBe("Next.js 16");
  });

  it("uses the release notes as the body, without the code fences", () => {
    const candidate = candidateFromGitHubRelease("vercel/next.js", release({ body: "Fixed a bug.\n\n```ts\nconst a = 1;\n```" }));
    expect(candidate?.bodyText).toBe("Fixed a bug.");
  });

  it("falls back to the tag when the release has no name", () => {
    expect(candidateFromGitHubRelease("vercel/next.js", release({ name: null }))?.title).toBe("vercel/next.js v16.0.0");
  });

  it("leaves the author null rather than crediting whoever cut the release", () => {
    expect(candidateFromGitHubRelease("vercel/next.js", release())?.author).toBeNull();
  });

  it("reads the reaction total", () => {
    expect(githubEngagement(release())).toBe(120);
    expect(githubEngagement(release({ reactions: null }))).toBe(0);
  });
});

describe("youtube", () => {
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"
          xmlns:media="http://search.yahoo.com/mrss/"
          xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <yt:videoId>dQw4w9WgXcQ</yt:videoId>
        <title>Building with Next.js 16</title>
        <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
        <author><name>Vercel</name></author>
        <published>2026-09-01T00:00:00+00:00</published>
        <media:group>
          <media:description>A walkthrough of the new bundler.</media:description>
          <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"/>
          <media:community>
            <media:starRating count="480"/>
            <media:statistics views="12000"/>
          </media:community>
        </media:group>
      </entry>
    </feed>`;

  it("validates channel ids and reads one from a feed URL", () => {
    expect(isValidChannelId("UCabcdefghijklmnopqrstuv")).toBe(true);
    expect(isValidChannelId("vercel")).toBe(false);
    expect(channelIdFromFeedUrl("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv")).toBe(
      "UCabcdefghijklmnopqrstuv",
    );
    expect(channelIdFromFeedUrl("https://example.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv")).toBeNull();
    expect(channelIdFromFeedUrl("https://www.youtube.com/feeds/videos.xml")).toBeNull();
  });

  it("keeps the view and rating counts the generic RSS parser would drop", () => {
    const [video] = parseYouTubeFeed(feed);
    expect(video.views).toBe(12_000);
    expect(video.likes).toBe(480);
    expect(youtubeEngagement(video)).toBe(12_480);
  });

  it("maps the entry to a candidate with its channel, description and thumbnail", () => {
    const [video] = parseYouTubeFeed(feed);
    expect(video.candidate.title).toBe("Building with Next.js 16");
    expect(video.candidate.author).toBe("Vercel");
    expect(video.candidate.summary).toBe("A walkthrough of the new bundler.");
    expect(video.candidate.imageUrl).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
    expect(video.candidate.canonicalUrl).toContain("watch");
    expect(video.candidate.externalId).toBe("yt:dQw4w9WgXcQ");
  });

  it("reports zero rather than guessing when a video carries no statistics", () => {
    const withoutStats = feed.replace(/<media:community>[\s\S]*?<\/media:community>/, "");
    const [video] = parseYouTubeFeed(withoutStats);
    expect(youtubeEngagement(video)).toBe(0);
  });

  it("returns nothing for a document that is not a feed", () => {
    expect(parseYouTubeFeed("<html><body>nope</body></html>")).toEqual([]);
  });
});

describe("adapter kinds", () => {
  // The qualification gate exempts releases and videos from the substance bar
  // and releases from staleness, but only when the candidate carries a kind.
  // Nothing set one until the adapters did, so the exemptions only ever ran in
  // the score tests while live releases were rejected as thin content.
  it("scores GitHub releases as releases and YouTube uploads as videos", async () => {
    const { githubReleasesAdapter } = await import("@/lib/ingestion/github-releases-source");
    const { youtubeAdapter } = await import("@/lib/ingestion/youtube-source");
    expect(githubReleasesAdapter.kind).toBe("release");
    expect(youtubeAdapter.kind).toBe("video");
  });
});
