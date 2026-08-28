import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getAdminSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { contentItemId, isRead } = await req.json();

    if (!contentItemId || typeof isRead !== "boolean") {
      return NextResponse.json({ error: "contentItemId and boolean isRead are required" }, { status: 400 });
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

    const { data, error } = await supabase.from("saved_items").upsert(
      {
        user_id: profile.id,
        content_item_id: contentItemId,
        is_read: isRead,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_item_id" }
    ).select().single();

    if (error) {
      console.error("Update read state error:", error);
      return NextResponse.json({ error: "Failed to update read state" }, { status: 500 });
    }

    return NextResponse.json({ success: true, savedItem: data });
  } catch (error) {
    console.error("Read State API Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
