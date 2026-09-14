import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { rankItems } from "@/lib/ranking";
import { interests, type FeedItem, type FeedView, type Interest } from "@/lib/types";
import { CONTENT_ITEM_SELECTION, toFeedItem, type ContentItemRow } from "@/lib/feed-item";
import { matchesSelectedInterests } from "@/lib/feed-relevance";
import { isLikelyNonEnglish } from "@/lib/qualification/reject";
import { cardKeyPoints } from "@/lib/summarize";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Items per page. The reader asks for the next page by sending back the
 * `nextCursor` it received; a null cursor means the list is complete.
 */
const FEED_PAGE_SIZE = 50;

/**
 * How far back each view reaches.
 *
 * For You is a briefing, not an archive: it answers "what should I read now",
 * so a story from last month is noise however well it scores. Trending and
 * Latest keep the wider window -- Latest is explicitly the full list newest
 * first, and truncating it would make the label wrong.
 *
 * A search is an archive lookup by definition, so it always uses the wide
 * window whatever view it was typed into.
 *
 * Saved items are exempt in every view (see the filter below): a saved article
 * must survive a refresh no matter how old it is.
 */
const FEED_WINDOW_DAYS: Record<FeedView, number> = {
  "for-you": 3,
  trending: 365,
  latest: 365,
};
const SEARCH_WINDOW_DAYS = 365;

/** Longer than any real query; guards the in-memory scan, not the database. */
const MAX_QUERY_LENGTH = 120;

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * The cursor is the offset into the ranked list. Ranking is deterministic for
 * a given set of rows (the exploration term hashes the item id), so page N+1
 * continues where page N stopped rather than reshuffling under the reader.
 */
function parseCursor(value: string | null): number {
  const parsed = Number(value ?? 0);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function pageOf<T>(ordered: T[], cursor: number) {
  const end = cursor + FEED_PAGE_SIZE;
  return { items: ordered.slice(cursor, end), nextCursor: end < ordered.length ? String(end) : null };
}

/**
 * Case-insensitive substring match over what the card shows. Applied on the
 * server over every eligible row in the window, so a hit on page four is found
 * even though the reader has only loaded page one.
 */
function matchesQuery(item: FeedItem, query: string): boolean {
  if (!query) return true;
  return `${item.title} ${item.excerpt} ${item.author ?? ""} ${item.source}`.toLowerCase().includes(query);
}

/**
 * Marky is an English reader. Ingestion rejects non-English candidates, but
 * rows stored before that gate existed, and any path that bypasses it, still
 * reach this table, so the same rule is applied on the way out. Saved and
 * submitted items are exempt: a reader's own choice is not the feed's call.
 */
function isReadable(row: ContentItemRow, ownedByReader: boolean): boolean {
  if (ownedByReader) return true;
  return !isLikelyNonEnglish({
    title: row.title,
    summary: row.summary,
    bodyText: null,
    canonicalUrl: row.canonical_url,
    publishedAt: row.published_at,
  });
}

/**
 * Adds three to five verbatim sentences from each article body to the page
 * being returned. Done for the page only, after ranking: bodies run to 20k
 * characters, and loading them for every eligible row to rank fifty would
 * multiply the feed's payload from the database many times over. One extra
 * query per page instead. A failure here costs the points, never the feed.
 */
async function withKeyPoints(admin: SupabaseClient, items: FeedItem[]): Promise<FeedItem[]> {
  if (!items.length) return items;
  const { data, error } = await admin
    .from("content_items")
    .select("id,body_content")
    .in("id", items.map((item) => item.id));
  if (error) {
    console.warn("[Feed API] Key points skipped; body query failed:", error.message);
    return items;
  }
  const bodies = new Map((data ?? []).map((row) => [row.id as string, (row.body_content as string | null) ?? null]));
  return items.map((item) => {
    const points = cardKeyPoints(bodies.get(item.id), item.interests);
    return points.length ? { ...item, keyPoints: points } : item;
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = (params.get("view") ?? "for-you") as FeedView;
  // The Saved library and the dashboard read the same endpoint, so the caller
  // has to say which one it is: a submitted link belongs in the library only.
  const savedLibrary = params.get("page") === "saved";
  // Library tab: links the reader pasted in, or posts they bookmarked.
  const savedTab = params.get("tab") === "posts" ? "posts" : params.get("tab") === "links" ? "links" : null;
  const query = (params.get("q") ?? "").trim().toLowerCase().slice(0, MAX_QUERY_LENGTH);
  const cursor = parseCursor(params.get("cursor"));
  if (!new Set(["for-you", "trending", "latest"]).has(view)) return NextResponse.json({ error: "Invalid view." }, { status: 400 });

  // Explicit opt-in Demo Mode ONLY
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    const defaultInterests = interests.slice(0, 3) as unknown as Interest[];
    const demoOrdered = rankItems(demoItems.filter((item) => matchesQuery(item, query)), view, defaultInterests);
    const page = pageOf(demoOrdered, cursor);
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor, demo: true });
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

  // 4. Query content items matching user's selected topics, inside the view's
  // window. PostgREST caps any response at the project's max-rows setting
  // (1000 locally; a dashboard setting on the hosted project) and returns a
  // truncated page with no error, so the links are read in pages until the
  // exact count is reached. The next offset is wherever the last page really
  // ended, so a cap below the page size only costs round trips, never rows.
  // The window filter is pushed into the query so those pages stay few: For
  // You needs three days of links, not the whole table. Unknown dates fall
  // out here as well, which the filter below would have done anyway.
  const windowDays = query ? Math.max(FEED_WINDOW_DAYS[view], SEARCH_WINDOW_DAYS) : FEED_WINDOW_DAYS[view];
  const recentCutoff = Date.now() - windowDays * 86_400_000;
  const TOPIC_LINK_PAGE = 1000;
  const topicItemIds: string[] = [];
  let expectedLinks = Number.POSITIVE_INFINITY;
  let offset = 0;
  while (offset < expectedLinks) {
    const { data: page, count, error: topicItemsError } = await admin
      .from("content_item_topics")
      .select("content_item_id,content_items!inner(published_at)", { count: "exact" })
      .in("topic_id", selectedTopicIds)
      .gte("content_items.published_at", new Date(recentCutoff).toISOString())
      .order("content_item_id")
      .order("topic_id")
      .range(offset, offset + TOPIC_LINK_PAGE - 1);
    if (topicItemsError) {
      console.error("[Feed API] Error fetching content_item_topics:", topicItemsError);
      break;
    }
    const rows = page ?? [];
    if (!rows.length) break;
    for (const row of rows) topicItemIds.push(row.content_item_id as string);
    expectedLinks = count ?? expectedLinks;
    offset += rows.length;
  }

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

  const items: FeedItem[] = (contentRows ?? []).filter((row) => {
    const submitted = submittedItemIds.has(row.id);
    const saved = savedByItem.has(row.id);
    // Excluded before the saved-item exemption below, which would otherwise
    // pull every submitted link straight back into the dashboard.
    if (!savedLibrary && submitted) return false;
    if (savedLibrary && savedTab) {
      if (!saved) return false;
      if (savedTab === "links" ? !submitted : submitted) return false;
    }
    if (!isReadable(row as unknown as ContentItemRow, saved || submitted)) return false;
    // A saved item is always visible, even if qualification later retired it.
    if (saved) return true;
    if (row.is_hidden) return false;
    const published = row.published_at ? Date.parse(row.published_at) : Number.NaN;
    return !Number.isNaN(published) && published >= recentCutoff;
  }).map((row) => toFeedItem(row as unknown as ContentItemRow, {
    saved: savedByItem.has(row.id),
    read: savedByItem.get(row.id) ?? false,
    selected: selectedTopicNames,
    isSubmittedLink: submittedItemIds.has(row.id),
  }));

  // A stored topic link only proves the story mentioned the topic. Following
  // OpenAI should not surface an NVIDIA piece that says "OpenAI" once, so keep
  // only stories a selected topic actually leads. Saved items stay regardless:
  // the reader chose those.
  const relevant = items.filter((item) => (item.saved || matchesSelectedInterests(item, selectedTopicNames)) && matchesQuery(item, query));

  console.log(`[Feed API] Topic relevance kept ${relevant.length} of ${items.length} item(s) for:`, selectedTopicNames, query ? `query="${query}"` : "");

  const ordered = rankItems(relevant, view, selectedTopicNames);
  const savedFirst = view === "for-you"
    ? [...ordered.filter((item) => item.saved), ...ordered.filter((item) => !item.saved)]
    : ordered;
  const page = pageOf(savedFirst, cursor);
  const pageItems = await withKeyPoints(admin, page.items);

  return NextResponse.json(
    { items: pageItems, selectedTopics: selectedTopicNames, nextCursor: page.nextCursor, total: savedFirst.length, personalized: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
