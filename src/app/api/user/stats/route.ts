import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";

/**
 * Reading-activity counts for the profile page.
 *
 * The dashboard feed cannot supply these: it excludes the reader's own
 * submissions and only reaches back a few days, so counting its items
 * under-reports. This reads the ownership tables directly, scoped to the
 * resolved profile.
 *
 * "Links" are saved items the reader submitted; "posts" are saved items Marky
 * found and they bookmarked. "Read" is counted over saved items, which is
 * where read state is stored.
 */
export async function GET() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ links: 0, posts: 0, read: 0, topics: 0, demo: true });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (profileError) return NextResponse.json({ error: "Profile unavailable." }, { status: 502 });
  if (!profile) return NextResponse.json({ links: 0, posts: 0, read: 0, topics: 0 }, { headers: { "Cache-Control": "private, no-store" } });

  const [savedResult, submittedResult, topicsResult] = await Promise.all([
    supabase.from("saved_items").select("content_item_id,is_read").eq("user_id", profile.id),
    supabase.from("user_submissions").select("content_item_id").eq("user_id", profile.id).eq("status", "completed").not("content_item_id", "is", null),
    supabase.from("user_topics").select("topic_id", { count: "exact", head: true }).eq("user_id", profile.id),
  ]);
  if (savedResult.error || submittedResult.error || topicsResult.error) {
    return NextResponse.json({ error: "Reading activity could not be loaded." }, { status: 502 });
  }

  const submitted = new Set((submittedResult.data ?? []).map((row) => row.content_item_id as string));
  let links = 0;
  let posts = 0;
  let read = 0;
  for (const row of savedResult.data ?? []) {
    if (submitted.has(row.content_item_id as string)) links += 1;
    else posts += 1;
    if (row.is_read) read += 1;
  }

  return NextResponse.json(
    { links, posts, read, topics: topicsResult.count ?? 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
