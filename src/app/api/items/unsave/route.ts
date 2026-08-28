import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { contentItemId } = await req.json();

    if (!contentItemId) {
      return NextResponse.json({ error: "contentItemId is required" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const { error } = await supabase
      .from("saved_items")
      .delete()
      .eq("user_id", profile.id)
      .eq("content_item_id", contentItemId);

    if (error) {
      console.error("Unsave item error:", error);
      return NextResponse.json({ error: "Failed to unsave item" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unsave API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
