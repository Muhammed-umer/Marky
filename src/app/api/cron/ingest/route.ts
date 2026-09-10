import { NextResponse } from "next/server";
import { ingestSource, type IngestionSource } from "@/lib/ingestion";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
import { matchesKind, parseIngestKind } from "@/lib/ingestion/source-kinds";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function isDue(source: IngestionSource, now = Date.now()) {
  const lastSuccess = source.last_success_at ?? source.last_fetched_at;
  if (!lastSuccess) return true;
  const lastFetch = Date.parse(lastSuccess);
  const interval = source.fetch_interval_minutes ?? 30;
  return Number.isNaN(lastFetch) || now - lastFetch >= interval * 60_000;
}

async function runIngestion(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ processed: 0, fetched: 0, inserted: 0, duplicates: 0, demo: true });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const [{ data: sourceRows, error: sourceError }, { data: topicRows, error: topicError }] = await Promise.all([
    supabase
      .from("sources")
      .select("id,name,source_type,feed_url,site_url,etag,last_modified,last_success_at,last_fetched_at,fetch_interval_minutes,max_article_age_days,trust_tier,discovery_query,min_engagement")
      .eq("is_active", true),
    supabase.from("topics").select("id,name"),
  ]);
  if (sourceError || topicError) {
    return NextResponse.json(
      {
        error: "Ingestion configuration could not be loaded.",
        code: sourceError?.code ?? topicError?.code ?? "CONFIG_QUERY_FAILED",
      },
      { status: 502 },
    );
  }

  // Feeds and discovery run on separate cron jobs: a discovery run also
  // fetches article pages, and one 60s budget cannot hold both across 62
  // sources. Absent or unrecognised means "all", so an older deployment or a
  // malformed call still ingests.
  const kind = parseIngestKind(new URL(request.url).searchParams.get("kind"));
  const dueSources = (sourceRows as IngestionSource[]).filter((source) => matchesKind(source.source_type, kind) && isDue(source));
  // Raised from 4 once the per-candidate lookup was batched: a source run is
  // now dominated by two network waits (the feed, then page extraction) rather
  // than a long tail of database round trips, so more of them overlap safely
  // inside the 60s budget.
  const results = await runWithConcurrency(dueSources, 8, (source) => ingestSource(supabase, source, topicRows ?? []));
  const failed = results.filter((result) => result.status === "failed");
  return NextResponse.json({
    processed: results.length,
    fetched: results.reduce((total, result) => total + result.fetched, 0),
    inserted: results.reduce((total, result) => total + result.inserted, 0),
    duplicates: results.reduce((total, result) => total + result.duplicates, 0),
    rejected: results.reduce((total, result) => total + result.rejected, 0),
    failed: failed.length,
    status: failed.length ? "partial" : "succeeded",
    errors: failed.map((result) => ({ sourceId: result.sourceId, code: result.errorCode })),
  });
}

export async function GET(request: Request) {
  return runIngestion(request);
}

export async function POST(request: Request) {
  return runIngestion(request);
}
