import { NextResponse } from "next/server";
import { ingestSource, type IngestionSource } from "@/lib/ingestion";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
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
      .select("id,name,source_type,feed_url,site_url,etag,last_modified,last_success_at,last_fetched_at,fetch_interval_minutes")
      .eq("is_active", true)
      .limit(30),
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

  const dueSources = (sourceRows as IngestionSource[]).filter((source) => isDue(source));
  const results = await runWithConcurrency(dueSources, 4, (source) => ingestSource(supabase, source, topicRows ?? []));
  const failed = results.filter((result) => result.status === "failed");
  return NextResponse.json({
    processed: results.length,
    fetched: results.reduce((total, result) => total + result.fetched, 0),
    inserted: results.reduce((total, result) => total + result.inserted, 0),
    duplicates: results.reduce((total, result) => total + result.duplicates, 0),
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
