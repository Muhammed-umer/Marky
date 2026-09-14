import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  // Loaded on demand for the same reason as /api/cron/ingest: the worker pulls
  // in jsdom, and a module that fails to load should say so, not return an
  // empty 500.
  let queue: typeof import("@/lib/submissions/queue");
  try {
    queue = await import("@/lib/submissions/queue");
  } catch (error) {
    console.error("[Link queue] Worker module failed to load:", error);
    return NextResponse.json(
      { error: "Queue worker code failed to load.", code: "QUEUE_MODULE_LOAD_FAILED", node: process.version, detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error) },
      { status: 503 },
    );
  }
  try { return NextResponse.json({ processed: await queue.processLinkQueue(supabase, 5) }); }
  catch { return NextResponse.json({ error: "Queue worker failed." }, { status: 502 }); }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
