export type { TrustTier } from "@/lib/types";
import type { TrustTier } from "@/lib/types";

export type EngagementPlatform = "hacker_news" | "reddit" | "dev_to" | "stack_exchange" | "github" | "youtube";

export type CandidateKind = "article" | "release" | "video" | "repository" | "discussion";

export interface QualificationCandidate {
  title: string;
  summary: string | null;
  bodyText: string | null;
  canonicalUrl: string;
  publishedAt: string | null;
  kind?: CandidateKind;
  /**
   * Null means the platform reports no engagement at all (an RSS feed), which
   * is different from a platform reporting zero. See scoreCandidate.
   */
  engagementCount?: number | null;
  platform?: EngagementPlatform | null;
  /** True when the page is behind a paywall, as far as extraction could tell. */
  paywalled?: boolean;
}

export interface QualificationContext {
  /** Topic aliases to measure relevance against, lower-cased. */
  aliases: string[];
  trust: TrustTier;
  /** Titles stored in the recent window, for near-duplicate detection. */
  recentTitles?: string[];
  /** True when this exact url_hash is already stored. */
  duplicate?: boolean;
  now?: Date;
}

export interface ScoreBreakdown {
  relevance: number;
  trust: number;
  substance: number;
  engagement: number | null;
  freshness: number;
}

export interface QualificationResult {
  accepted: boolean;
  score: number;
  /** Machine-readable: 'qualified', or why it was rejected. */
  reason: string;
  breakdown: ScoreBreakdown;
}
