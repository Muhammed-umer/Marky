import { recencyScore } from "@/lib/ranking";
import type {
  EngagementPlatform,
  QualificationCandidate,
  QualificationContext,
  ScoreBreakdown,
  TrustTier,
} from "@/lib/qualification/types";

/** Weights from the Discovery Map. They must sum to 1. */
export const WEIGHTS = {
  relevance: 0.35,
  trust: 0.2,
  substance: 0.2,
  engagement: 0.15,
  freshness: 0.1,
} as const;

export const QUALIFICATION_THRESHOLD = 0.6;

/** Words of body text scanned before a match counts as "tail only". */
const LEAD_WORDS = 300;
/** Exported so ingestion can decide when a feed's body is worth a page fetch. */
export const SUBSTANTIAL_WORDS = 400;
const THIN_WORDS = 150;
const MAX_AGE_DAYS = 60;

const TRUST_SCORES: Record<TrustTier, number> = {
  official: 1,
  community: 0.7,
  probationary: 0.4,
  unknown: 0.2,
};

/**
 * Engagement counts are not comparable across platforms: 50 points on Hacker
 * News is roughly 200 upvotes on Reddit. Each platform's reference value maps
 * to a score of 1.
 */
const ENGAGEMENT_REFERENCE: Record<EngagementPlatform, number> = {
  hacker_news: 50,
  reddit: 200,
  dev_to: 30,
  stack_exchange: 20,
  github: 100,
  youtube: 5000,
};

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function words(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.toLowerCase().split(/[^a-z0-9.+#/-]+/).filter(Boolean);
}

export function wordCount(candidate: QualificationCandidate): number {
  return words(candidate.bodyText ?? candidate.summary).length;
}

/**
 * An alias in the title is what the item is about; an alias only in the tail of
 * a long article is a passing mention.
 */
export function relevanceScore(candidate: QualificationCandidate, aliases: string[]): number {
  if (!aliases.length) return 0;
  const title = candidate.title.toLowerCase();
  if (aliases.some((alias) => title.includes(alias))) return 1;

  const body = `${candidate.summary ?? ""} ${candidate.bodyText ?? ""}`.toLowerCase().trim();
  if (!body) return 0;
  const lead = body.split(/\s+/).slice(0, LEAD_WORDS).join(" ");
  if (aliases.some((alias) => lead.includes(alias))) return 0.7;
  return aliases.some((alias) => body.includes(alias)) ? 0.3 : 0;
}

export function trustScore(trust: TrustTier): number {
  return TRUST_SCORES[trust] ?? TRUST_SCORES.unknown;
}

/** Plain-text heuristics; extracted bodies have had their markup stripped. */
export function hasCode(candidate: QualificationCandidate): boolean {
  const text = candidate.bodyText ?? "";
  if (!text) return false;
  return /```|\b(?:npm|npx|pnpm|yarn|pip|cargo)\s+\w+|\b(?:const|let|function|import|export|def|class)\s+[A-Za-z_$]/.test(text);
}

export function substanceScore(candidate: QualificationCandidate): number {
  // A release note or a video is substantive at any length; that is the whole
  // artefact, not a teaser for one.
  if (candidate.kind === "release" || candidate.kind === "video") return 1;
  const count = wordCount(candidate);
  if (count >= SUBSTANTIAL_WORDS || hasCode(candidate)) return 1;
  return count >= THIN_WORDS ? 0.5 : 0;
}

export function engagementScore(count: number, platform: EngagementPlatform): number {
  const reference = ENGAGEMENT_REFERENCE[platform] ?? 50;
  return clamp01(Math.log10(count + 1) / Math.log10(reference + 1));
}

export function freshnessScore(publishedAt: string | null, now = new Date()): number {
  // Same 48-hour half-life the feed already ranks with.
  return recencyScore(publishedAt, now);
}

export function ageDays(publishedAt: string | null, now = new Date()): number | null {
  if (!publishedAt) return null;
  const timestamp = Date.parse(publishedAt);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

export function isStale(candidate: QualificationCandidate, now = new Date()): boolean {
  if (candidate.kind === "release") return false;
  const age = ageDays(candidate.publishedAt, now);
  return age !== null && age > MAX_AGE_DAYS;
}

export interface ScoredCandidate {
  score: number;
  breakdown: ScoreBreakdown;
}

/**
 * Weighted sum of the five signals.
 *
 * Deviation from the Discovery Map worth knowing about: when a source reports
 * no engagement at all (every RSS feed), the engagement weight is redistributed
 * across the other four signals rather than scored as zero. Scoring it zero
 * caps every official-blog item at 0.85 and, once substance dips to 0.5, drops
 * genuinely good posts below the 0.6 threshold purely for lacking vote counts —
 * which would gut the trusted tier the whole design rests on. A platform that
 * reports an actual zero still scores zero.
 */
export function scoreCandidate(candidate: QualificationCandidate, context: QualificationContext): ScoredCandidate {
  const now = context.now ?? new Date();
  const platform = candidate.platform ?? null;
  const rawEngagement = candidate.engagementCount ?? null;
  const engagement = platform && rawEngagement !== null ? engagementScore(rawEngagement, platform) : null;

  const breakdown: ScoreBreakdown = {
    relevance: relevanceScore(candidate, context.aliases),
    trust: trustScore(context.trust),
    substance: substanceScore(candidate),
    engagement,
    freshness: freshnessScore(candidate.publishedAt, now),
  };

  const parts: Array<[number, number]> = [
    [breakdown.relevance, WEIGHTS.relevance],
    [breakdown.trust, WEIGHTS.trust],
    [breakdown.substance, WEIGHTS.substance],
    [breakdown.freshness, WEIGHTS.freshness],
  ];
  if (engagement !== null) parts.push([engagement, WEIGHTS.engagement]);

  const totalWeight = parts.reduce((total, [, weight]) => total + weight, 0);
  const weighted = parts.reduce((total, [value, weight]) => total + value * weight, 0);
  return { score: clamp01(weighted / totalWeight), breakdown };
}
