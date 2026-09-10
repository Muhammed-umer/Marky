import { NextResponse } from "next/server";
import { DEFAULT_PURGE_LIMIT, DEFAULT_PURGE_WINDOW_DAYS, runLanguagePurge } from "@/lib/ingestion/language-purge-store";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Deletes stored content the language gate would reject today -- rows that were
 * ingested before the gate covered their path. Defaults to a dry run; pass
 * dryRun=false to write. Deletion is irreversible, so read a dry run first.
 *
 * Not scheduled: an operator tool, run by hand with the cron secret, exactly
 * like /api/cron/dedupe.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ error: "Purging requires live mode." }, { status: 503 });
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") !== "false";
  const windowDays = positiveInt(url.searchParams.get("windowDays"), DEFAULT_PURGE_WINDOW_DAYS);
  const limit = positiveInt(url.searchParams.get("limit"), DEFAULT_PURGE_LIMIT);

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  try {
    const report = await runLanguagePurge(supabase, { dryRun, windowDays, limit });
    return NextResponse.json(report, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]{2,60}$/.test(error.message) ? error.message : "PURGE_FAILED";
    return NextResponse.json({ error: "The language purge could not complete.", code }, { status: 502 });
  }
}
