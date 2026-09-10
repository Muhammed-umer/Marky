import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { rankItems } from "@/lib/ranking";
import { interests, type FeedItem, type FeedView, type Interest } from "@/lib/types";
import { CONTENT_ITEM_SELECTION, toFeedItem, type ContentItemRow } from "@/lib/feed-item";
import { matchesSelectedInterests } from "@/lib/feed-relevance";
import { createAdminSupabaseClient } from "@/lib/supabase";

/**
 * How many items each view returns.
 *
 * There is no pagination yet -- nextCursor is always null -- so this is a hard
 * ceiling on what a reader can reach, not a page size: anything past it is
 * invisible however well it scores.
 *
 * For You carries more because it is the view being read: with the 3-day
 * window it has ~170 candidates, and 30 threw away most of them. Trending and
 * Latest stay at 30, where the point is the top of the ordering rather than
 * the whole list.
 */
const FEED_PAGE_SIZE: Record<FeedView, number> = {
  "for-you": 100,
  trending: 30,
  latest: 30,
};

/**
 * How far back each view reaches.
 *
 * For You is a briefing, not an archive: it answers "what should I read now",
 * so a story from last month is noise however well it scores. Trending and
 * Latest keep the wider window -- Latest is explicitly the full list newest
 * first, and truncating it would make the label wrong.
 *
 * Saved items are exempt in every view (see the filter below): a saved article
 * must survive a refresh no matter how old it is.
 */
const FEED_WINDOW_DAYS: Record<FeedView, number> = {
  "for-you": 3,
  trending: 365,
  latest: 365,
};

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function GET(request: NextRequest) {
  const view = (request.nextUrl.searchParams.get("view") ?? "for-you") as FeedView;
  // The Saved library and the dashboard read the same endpoint, so the caller
  // has to say which one it is: a submitted link belongs in the library only.
  const savedLibrary = request.nextUrl.searchParams.get("page") === "saved";
  if (!new Set(["for-you", "trending", "latest"]).has(view)) return NextResponse.json({ error: "Invalid view." }, { status: 400 });

  // Explicit opt-in Demo Mode ONLY
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const defaultInterests = interests.slice(0, 3) as unknown as Interest[];
    return NextResponse.json({ items: rankItems(demoItems, view, defaultInterests), nextCursor: null, demo: true });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ items: [], unauthenticated: true }, { status: 401 });
  }

  const admin = createAdminSupabaseClient();
  if (!admin) {
    console.error("[Feed API] createAdminSupabaseClient returned null. Please verify NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.");
    return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  }

  // 1. Load or create user profile
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({ clerk_user_id: userId, email: `${userId}@user.marky` }, { onConflict: "clerk_user_id" })
    .select("id, onboarded")
    .single();
  if (profileError || !profile) {
    console.error("[Feed API] Failed to load/create user profile in Supabase:", profileError);
    return NextResponse.json({ error: "User profile could not be loaded.", details: profileError?.message }, { status: 502 });
  }

  // 2. Fetch user's selected topics from user_topics
  const { data: userTopicRows, error: userTopicsError } = await admin
    .from("user_topics")
    .select("topic_id, topic:topics(id, name, slug)")
    .eq("user_id", profile.id);

  if (userTopicsError) {
    console.error("[Feed API] Error fetching user_topics:", userTopicsError);
  }

  const selectedTopicNames = (userTopicRows ?? []).map((row) => {
    const t = Array.isArray(row.topic) ? row.topic[0] : row.topic;
    return t?.name;
  }).filter(Boolean) as Interest[];

  const selectedTopicIds = (userTopicRows ?? []).map((row) => row.topic_id);

  console.log(`[Feed API] User ${userId} (profile: ${profile.id}) has ${selectedTopicIds.length} topic(s) selected:`, selectedTopicNames);

  // If user has not selected any topics yet, flag for onboarding
  if (selectedTopicIds.length === 0) {
    return NextResponse.json({ items: [], needsOnboarding: true, selectedTopics: [] });
  }

  // 3. Fetch user's saved items
  const { data: savedRows, error: savedError } = await admin.from("saved_items").select("content_item_id,is_read").eq("user_id", profile.id);
  if (savedError) {
    console.error("[Feed API] Error fetching saved_items:", savedError);
    return NextResponse.json({ error: "Feed could not be loaded.", details: savedError.message }, { status: 502 });
  }

  const savedByItem = new Map((savedRows ?? []).map((row) => [row.content_item_id as string, Boolean(row.is_read)]));

  // A link the reader submitted is theirs to keep, not a recommendation to
  // hand back to them: it belongs in Saved and nowhere else. Scoped to this
  // profile, so the same article discovered by a source still reaches other
  // readers normally.
  const { data: submittedRows } = await admin
    .from("user_submissions")
    .select("content_item_id")
    .eq("user_id", profile.id)
    .eq("status", "completed")
    .not("content_item_id", "is", null);
  const submittedItemIds = new Set((submittedRows ?? []).map((row) => row.content_item_id as string));
  const savedIds = [...savedByItem.keys()];

  // 4. Query content items matching user's selected topics
  const { data: topicItemRows, error: topicItemsError } = await admin
    .from("content_item_topics")
    .select("content_item_id")
    .in("topic_id", selectedTopicIds);

  if (topicItemsError) {
    console.error("[Feed API] Error fetching content_item_topics:", topicItemsError);
  }

  const topicItemIds = (topicItemRows ?? []).map((row) => row.content_item_id);
  const eligibleItemIds = [...new Set([...topicItemIds, ...savedIds])];

  console.log(`[Feed API] Eligible items: ${eligibleItemIds.length} (${topicItemIds.length} from topics, ${savedIds.length} saved)`);

  if (eligibleItemIds.length === 0) {
    console.log("[Feed API] No eligible items found for user topics. Returning empty list.");
    return NextResponse.json({ items: [], selectedTopics: selectedTopicNames, nextCursor: null, personalized: true });
  }

  // PostgREST encodes array parameters in the GET URL query string. To avoid exceeding
  // HTTP header/URL length limits (16KB / UND_ERR_HEADERS_OVERFLOW), query in batches of 80 IDs.
  const contentSelection = `${CONTENT_ITEM_SELECTION},is_hidden`;
  const CHUNK_SIZE = 80;
  const idChunks = chunkArray(eligibleItemIds, CHUNK_SIZE);

  let contentRows: ContentItemRow[] = [];

  const chunkPromises = idChunks.map((chunk) =>
    admin
      .from("content_items")
      .select(contentSelection)
      .in("id", chunk)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(200)
  );

  const chunkResults = await Promise.all(chunkPromises);
  const failedChunk = chunkResults.find((r) => r.error);

  if (failedChunk?.error) {
    console.error("[Feed API] Primary chunked content query failed with error:", failedChunk.error);
    console.warn("[Feed API] Attempting baseline fallback query (omitting signals/is_hidden in case migrations were not run)...");

    const fallbackSelection = "id,title,summary,canonical_url,author,published_at,image_url,source:sources(name),content_item_topics(topic:topics(name))";
    const fallbackPromises = idChunks.map((chunk) =>
      admin
        .from("content_items")
        .select(fallbackSelection)
        .in("id", chunk)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(200)
    );

    const fallbackResults = await Promise.all(fallbackPromises);
    const failedFallback = fallbackResults.find((r) => r.error);

    if (failedFallback?.error) {
      console.error("[Feed API] Fallback content query also failed:", failedFallback.error);
      return NextResponse.json({
        error: "Feed content query failed.",
        details: failedChunk.error.message,
        hint: failedChunk.error.hint,
        code: failedChunk.error.code,
        fallbackDetails: failedFallback.error.message,
      }, { status: 502 });
    }

    console.warn("[Feed API] Fallback query succeeded! Notice: please apply the latest Supabase migrations from `supabase/migrations/` to enable signals and is_hidden fields.");
    contentRows = fallbackResults.flatMap((r) => (r.data ?? []) as unknown as ContentItemRow[]);
  } else {
    contentRows = chunkResults.flatMap((r) => (r.data ?? []) as unknown as ContentItemRow[]);
  }

  const recentCutoff = Date.now() - FEED_WINDOW_DAYS[view] * 86_400_000;
  const items: FeedItem[] = (contentRows ?? []).filter((row) => {
    // Excluded before the saved-item exemption below, which would otherwise
    // pull every submitted link straight back into the dashboard.
    if (!savedLibrary && submittedItemIds.has(row.id)) return false;
    // A saved item is always visible, even if qualification later retired it.
    if (savedByItem.has(row.id)) return true;
    if (row.is_hidden) return false;
    const published = row.published_at ? Date.parse(row.published_at) : Number.NaN;
    return !Number.isNaN(published) && published >= recentCutoff;
  }).map((row) => toFeedItem(row as unknown as ContentItemRow, {
    saved: savedByItem.has(row.id),
    read: savedByItem.get(row.id) ?? false,
    selected: selectedTopicNames,
  }));

  // A stored topic link only proves the story mentioned the topic. Following
  // OpenAI should not surface an NVIDIA piece that says "OpenAI" once, so keep
  // only stories a selected topic actually leads. Saved items stay regardless:
  // the reader chose those.
  const relevant = items.filter((item) => item.saved || matchesSelectedInterests(item, selectedTopicNames));

  console.log(`[Feed API] Topic relevance kept ${relevant.length} of ${items.length} item(s) for:`, selectedTopicNames);

  const ordered = rankItems(relevant, view, selectedTopicNames);
  const savedFirst = view === "for-you"
    ? [...ordered.filter((item) => item.saved), ...ordered.filter((item) => !item.saved)]
    : ordered;

  return NextResponse.json(
    { items: savedFirst.slice(0, FEED_PAGE_SIZE[view]), selectedTopics: selectedTopicNames, nextCursor: null, personalized: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
