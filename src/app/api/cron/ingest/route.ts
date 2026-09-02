import { NextResponse } from "next/server";
import { ingestSource, type IngestionSource } from "@/lib/ingestion";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function isDue(source: IngestionSource, now = Date.now()) {
  if (!source.last_successful_fetch) return true;
  const lastFetch = Date.parse(source.last_successful_fetch);
  return Number.isNaN(lastFetch) || now - lastFetch >= source.fetch_interval_minutes * 60_000;
}

async function runIngestion(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") {
    return NextResponse.json({ processed: 0, fetched: 0, inserted: 0, duplicates: 0, demo: true });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const [{ data: sourceRows, error: sourceError }, { data: interestRows, error: interestError }] = await Promise.all([
    supabase.from("sources").select("id,name,source_type,feed_url,site_url,etag,last_modified,last_successful_fetch,fetch_interval_minutes").eq("is_active", true).in("source_type", ["medium_rss", "rss"]).limit(30),
    supabase.from("interests").select("id,name"),
  ]);
  if (sourceError || interestError) {
    return NextResponse.json({
      error: "Ingestion configuration could not be loaded.",
      code: sourceError?.code ?? interestError?.code ?? "CONFIG_QUERY_FAILED",
    }, { status: 502 });
  }

  const dueSources = (sourceRows as IngestionSource[]).filter((source) => isDue(source));
  const results = await runWithConcurrency(dueSources, 4, (source) => ingestSource(supabase, source, interestRows ?? []));
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
