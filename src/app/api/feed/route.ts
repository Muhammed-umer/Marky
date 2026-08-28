import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminSupabase } from "@/lib/supabase/server";
import { scoreFeedItems } from "@/lib/feed/ranker";
import { FeedItem } from "@/types/database";

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const topicSlug = searchParams.get("topic");
    const readState = searchParams.get("readState") || "all"; // 'all' | 'unread' | 'read'
    const savedOnly = searchParams.get("savedOnly") === "true";

    const supabase = getAdminSupabase();

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ items: [], interests: [] });
    }

    // Fetch user interests
    const { data: userInterests } = await supabase
      .from("user_interests")
      .select("interest_id")
      .eq("user_id", profile.id);

    const userInterestIds = (userInterests || []).map((ui) => ui.interest_id);

    // Fetch all system interests
    const { data: allInterests } = await supabase.from("interests").select("*");

    // Fetch user saved items (for bookmark and read state mapping)
    const { data: savedItems } = await supabase
      .from("saved_items")
      .select("*")
      .eq("user_id", profile.id);

    const savedMap = new Map((savedItems || []).map((si) => [si.content_item_id, si]));

    // Fetch content items joined with sources
    const { data: contentItems } = await supabase
      .from("content_items")
      .select("*, source:sources(*)")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!contentItems || contentItems.length === 0) {
      return NextResponse.json({ items: [], interests: allInterests || [] });
    }

    // Score items
    const scoredItems = scoreFeedItems(contentItems, userInterestIds, {});

    // Attach saved & read states
    let feedItems: FeedItem[] = scoredItems.map((item) => {
      const savedRecord = savedMap.get(item.id);
      return {
        ...item,
        is_saved: Boolean(savedRecord),
        is_read: savedRecord ? savedRecord.is_read : false,
        saved_item: savedRecord || null,
      };
    });

    // Apply filtering rules
    if (savedOnly) {
      feedItems = feedItems.filter((item) => item.is_saved);
    }

    if (readState === "unread") {
      feedItems = feedItems.filter((item) => !item.is_read);
    } else if (readState === "read") {
      feedItems = feedItems.filter((item) => item.is_read);
    }

    // Sort by feed score descending
    feedItems.sort((a, b) => (b.score || 0) - (a.score || 0));

    return NextResponse.json({
      items: feedItems,
      interests: allInterests || [],
    });
  } catch (error) {
    console.error("Feed API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
