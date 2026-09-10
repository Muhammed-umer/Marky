import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The quota ledger the Discovery Map calls for.
 *
 * Two of the four discovery platforms publish a hard, IP-wide limit:
 * Stack Exchange allows 300 requests a day unauthenticated, GitHub 60 an hour.
 * Those budgets are shared by every source of that type, so no single source
 * can decide on its own whether a request is affordable -- the count has to
 * live somewhere both of them can see, which is the database.
 *
 * Spending is recorded *before* the request, not after. Overcounting a request
 * that then fails costs one slot; undercounting risks a 429 that Stack Exchange
 * answers with a temporary IP block.
 */

export type QuotaPlatform = "stack_exchange" | "github";

export interface QuotaBudget {
  /** Requests allowed per window. */
  limit: number;
  windowMinutes: number;
}

/**
 * Deliberately below each published ceiling. Marky is not the only thing that
 * might use this IP -- a preview deployment, a local run against the same NAT --
 * and the cost of stopping early is one quiet run, while the cost of going over
 * is a block that affects every source of that type.
 */
export const QUOTA_BUDGETS: Record<QuotaPlatform, QuotaBudget> = {
  // 300/day published.
  stack_exchange: { limit: 200, windowMinutes: 24 * 60 },
  // 60/hour published.
  github: { limit: 40, windowMinutes: 60 },
};

/**
 * Reserves one request against a platform's budget.
 *
 * Returns false when the budget is spent; the caller must then stop rather than
 * fetch. The window resets lazily inside the RPC, so an idle platform costs no
 * background work.
 */
export async function reserveQuota(client: SupabaseClient, platform: QuotaPlatform, cost = 1): Promise<boolean> {
  const budget = QUOTA_BUDGETS[platform];
  const { data, error } = await client.rpc("consume_discovery_quota", {
    p_platform: platform,
    p_cost: cost,
    p_limit: budget.limit,
    p_window_minutes: budget.windowMinutes,
  });
  // A ledger that cannot be read is not permission to spend: an unknown budget
  // is treated as exhausted, so a broken migration degrades to "no discovery"
  // rather than to "unlimited requests".
  if (error) throw new Error("QUOTA_LEDGER_UNAVAILABLE");
  return data === true;
}
