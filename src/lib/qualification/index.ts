import { hardRejectReason } from "@/lib/qualification/reject";
import { isStale, QUALIFICATION_THRESHOLD, scoreCandidate, substanceScore, wordCount } from "@/lib/qualification/score";
import type { QualificationCandidate, QualificationContext, QualificationResult } from "@/lib/qualification/types";

const EMPTY_BREAKDOWN = { relevance: 0, trust: 0, substance: 0, engagement: null, freshness: 0 } as const;

/**
 * The one algorithm: arithmetic, pure, and run before anything is stored.
 * Hard rejects short-circuit; everything else is a weighted score against
 * QUALIFICATION_THRESHOLD.
 */
export function qualifyCandidate(candidate: QualificationCandidate, context: QualificationContext): QualificationResult {
  const hardReject = hardRejectReason(candidate, context);
  if (hardReject) {
    return { accepted: false, score: 0, reason: hardReject, breakdown: { ...EMPTY_BREAKDOWN } };
  }

  const now = context.now ?? new Date();
  const { score, breakdown } = scoreCandidate(candidate, context);

  // Floors that no weighted total should be able to buy its way past.
  if (breakdown.relevance === 0) {
    return { accepted: false, score, reason: "no_topic_relevance", breakdown };
  }
  if (substanceScore(candidate) === 0) {
    return { accepted: false, score, reason: wordCount(candidate) ? "thin_content" : "no_extractable_content", breakdown };
  }
  if (isStale(candidate, now)) {
    return { accepted: false, score, reason: "stale", breakdown };
  }

  return score >= QUALIFICATION_THRESHOLD
    ? { accepted: true, score, reason: "qualified", breakdown }
    : { accepted: false, score, reason: "below_threshold", breakdown };
}

export { QUALIFICATION_THRESHOLD, WEIGHTS } from "@/lib/qualification/score";
export type {
  QualificationCandidate,
  QualificationContext,
  QualificationResult,
  TrustTier,
} from "@/lib/qualification/types";
