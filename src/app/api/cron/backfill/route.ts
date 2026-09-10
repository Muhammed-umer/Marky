import { NextResponse } from "next/server";
import { DEFAULT_BACKFILL_BATCH, recanonicalizeContentUrls, runBackfill } from "@/lib/ingestion/backfill";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-off, resumable backfill of rows stored before images, body text and the
 * qualification gate existed. Defaults to a dry run; pass dryRun=false to
 * write. Call repeatedly until `remaining` reaches 0.
 *
 * Not scheduled: it is an operator tool, run by hand with the cron secret.
 *
 * `mode=recanonicalize` instead re-applies the current canonicalisation rules
 * to stored URLs and merges rows that collapse onto the same hash. url_hash is
 * only ever computed at insert time, so when canonicalizeUrl learns to strip a
 * parameter -- as it did for Medium's per-feed `?source=rss----<tag>` stamp --
 * everything stored before that keeps its old hash and stays a duplicate. The
 * ordinary backfill re-scores content but never touches the URL.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ error: "Backfill requires live mode." }, { status: 503 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") !== "false";
  const limitParam = Number(url.searchParams.get("limit") ?? DEFAULT_BACKFILL_BATCH);
  const limit = Number.isFinite(limitParam) ? limitParam : DEFAULT_BACKFILL_BATCH;

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  try {
    if (url.searchParams.get("mode") === "recanonicalize") {
      const report = await recanonicalizeContentUrls(supabase, { dryRun, limit: Math.max(limit, 2000) });
      return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
    }
    const report = await runBackfill(supabase, { limit, dryRun });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{2,60}$/.test(error.message) ? error.message : "BACKFILL_FAILED";
    return NextResponse.json({ error: "The backfill could not complete.", code }, { status: 502 });
  }
}
