import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { processLinkQueue } from "@/lib/submissions/queue";

export const runtime = "nodejs";
export const maxDuration = 60;

async function run(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  try { return NextResponse.json({ processed: await processLinkQueue(supabase, 5) }); }
  catch { return NextResponse.json({ error: "Queue worker failed." }, { status: 502 }); }
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
