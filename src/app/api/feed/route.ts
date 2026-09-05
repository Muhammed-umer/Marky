import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { rankItems } from "@/lib/ranking";
import { interests, isValidAuthor, type FeedItem, type FeedView, type Interest } from "@/lib/types";
import { createAdminSupabaseClient } from "@/lib/supabase";

function relationName(value: { name: string } | Array<{ name: string }> | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

export async function GET(request: NextRequest) {
  const view = (request.nextUrl.searchParams.get("view") ?? "for-you") as FeedView;
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
  if (!admin) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  // 1. Load or create user profile
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({ clerk_user_id: userId, email: `${userId}@user.marky` }, { onConflict: "clerk_user_id" })
    .select("id, onboarded")
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "User profile could not be loaded." }, { status: 502 });

  // 2. Fetch user's selected topics from user_topics
  const { data: userTopicRows } = await admin
    .from("user_topics")
    .select("topic_id, topic:topics(id, name, slug)")
    .eq("user_id", profile.id);

  const selectedTopicNames = (userTopicRows ?? []).map((row) => {
    const t = Array.isArray(row.topic) ? row.topic[0] : row.topic;
    return t?.name;
  }).filter(Boolean) as Interest[];

  const selectedTopicIds = (userTopicRows ?? []).map((row) => row.topic_id);

  // If user has not selected any topics yet, flag for onboarding
  if (selectedTopicIds.length === 0) {
    return NextResponse.json({ items: [], needsOnboarding: true, selectedTopics: [] });
  }

  // 3. Fetch user's saved items
  const { data: savedRows, error: savedError } = await admin.from("saved_items").select("content_item_id,is_read").eq("user_id", profile.id);
  if (savedError) return NextResponse.json({ error: "Feed could not be loaded." }, { status: 502 });

  const savedByItem = new Map((savedRows ?? []).map((row) => [row.content_item_id as string, Boolean(row.is_read)]));
  const savedIds = [...savedByItem.keys()];

  // 4. Query content items matching user's selected topics
  const { data: topicItemRows } = await admin
    .from("content_item_topics")
    .select("content_item_id")
    .in("topic_id", selectedTopicIds);

  const topicItemIds = (topicItemRows ?? []).map((row) => row.content_item_id);
  const eligibleItemIds = [...new Set([...topicItemIds, ...savedIds])];

  if (eligibleItemIds.length === 0) {
    return NextResponse.json({ items: [], selectedTopics: selectedTopicNames, nextCursor: null, personalized: true });
  }

  const contentSelection = "id,title,summary,canonical_url,author,published_at,image_url,source:sources(name),content_item_topics(topic:topics(name))";
  const { data: contentRows, error: contentError } = await admin
    .from("content_items")
    .select(contentSelection)
    .in("id", eligibleItemIds)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(200);

  if (contentError) return NextResponse.json({ error: "Feed content query failed." }, { status: 502 });

  const recentCutoff = Date.now() - 365 * 86_400_000;
  const items: FeedItem[] = (contentRows ?? []).filter((row) => {
    const published = row.published_at ? Date.parse(row.published_at) : Number.NaN;
    return savedByItem.has(row.id) || (!Number.isNaN(published) && published >= recentCutoff);
  }).map((row) => {
    const itemInterests = (row.content_item_topics ?? []).flatMap((link) => {
      const name = relationName(link.topic);
      return interests.includes(name as Interest) ? [name as Interest] : [];
    });
    return {
      id: row.id,
      title: row.title,
      excerpt: row.summary ?? "Open the original source to read this story.",
      url: row.canonical_url,
      source: relationName(row.source) ?? new URL(row.canonical_url).hostname,
      author: row.author && isValidAuthor(row.author) ? row.author : null,
      publishedAt: row.published_at,
      imageUrl: row.image_url,
      engagementCount: 0,
      interests: itemInterests,
      sourceCount: 1,
      saved: savedByItem.has(row.id),
      read: savedByItem.get(row.id) ?? false,
      explanation: [itemInterests[0] ? `Matches ${itemInterests[0]}` : "Technology source", "From a tracked source"],
    };
  });

  const ordered = rankItems(items, view, selectedTopicNames);
  const savedFirst = view === "for-you"
    ? [...ordered.filter((item) => item.saved), ...ordered.filter((item) => !item.saved)]
    : ordered;

  return NextResponse.json(
    { items: savedFirst.slice(0, 30), selectedTopics: selectedTopicNames, nextCursor: null, personalized: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
