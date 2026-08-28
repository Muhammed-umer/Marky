export interface FeedScoringConfig {
  weightInterest: number;
  weightRecency: number;
  recencyHalfLifeHours: number;
}

export const DEFAULT_FEED_CONFIG: FeedScoringConfig = {
  weightInterest: 0.6,
  weightRecency: 0.4,
  recencyHalfLifeHours: 48,
};
