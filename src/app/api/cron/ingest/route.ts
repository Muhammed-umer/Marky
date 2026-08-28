import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ processed: 0, inserted: 0, duplicates: 0, demo: true });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const dueBefore = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: sources, error } = await supabase.from("sources").select("id,name,feed_url,etag,last_modified").eq("is_active", true).or(`last_successful_fetch.is.null,last_successful_fetch.lt.${dueBefore}`).limit(20);
  if (error) return NextResponse.json({ error: "Sources could not be loaded." }, { status: 502 });
  return NextResponse.json({ processed: sources?.length ?? 0, inserted: 0, duplicates: 0, message: "Source scheduling is active; RSS normalization runs in the next pipeline milestone." });
}
