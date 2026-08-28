import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { IngestionController } from "@/lib/ingestion/controller";
import { generateUrlHash } from "@/lib/ingestion/canonicalizer";
import { getAdminSupabase } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { url } = await req.json();

    if (!url || typeof url !== "string" || !url.trim().startsWith("http")) {
      return NextResponse.json({ error: "Please provide a valid web URL starting with http:// or https://" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    // Find profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found. Please complete onboarding." }, { status: 404 });
    }

    // Process ingestion
    const controller = new IngestionController();
    await controller.processSource(url.trim());

    // Fetch the inserted/existing content item by url_hash
    const urlHash = generateUrlHash(url.trim());
    const { data: contentItem, error: contentErr } = await supabase
      .from("content_items")
      .select("*")
      .eq("url_hash", urlHash)
      .single();

    if (contentErr || !contentItem) {
      return NextResponse.json({ error: "Failed to extract content from submitted URL" }, { status: 500 });
    }

    // Auto-save item to user's saved_items collection
    await supabase.from("saved_items").upsert(
      {
        user_id: profile.id,
        content_item_id: contentItem.id,
        saved_at: new Date().toISOString(),
      },
      { onConflict: "user_id,content_item_id" }
    );

    return NextResponse.json({ success: true, item: contentItem });
  } catch (error) {
    console.error("Manual URL Submission Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
