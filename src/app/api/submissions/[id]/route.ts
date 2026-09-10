import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { CONTENT_ITEM_SELECTION, toFeedItem, type ContentItemRow } from "@/lib/feed-item";
import { createAdminSupabaseClient } from "@/lib/supabase";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
  if (!profile) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const { data, error } = await supabase
    .from("user_submissions")
    .select("status,content_item_id,error_message")
    .eq("id", id)
    .eq("user_id", profile.id)
    .single();
  if (error || !data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

  // The dashboard adds the article the moment it lands, without a refresh, so a
  // completed submission has to return the item itself and not just a status.
  // It is built through the shared mapper the feed uses, so the card the poller
  // inserts is identical to the one a reload would show.
  let item = null;
  if (data.status === "completed" && data.content_item_id) {
    const { data: row } = await supabase
      .from("content_items")
      .select(CONTENT_ITEM_SELECTION)
      .eq("id", data.content_item_id)
      .maybeSingle();
    if (row) {
      // The submission worker writes the saved_items row, so a completed
      // submission is saved by definition; read state starts false.
      const { data: savedRow } = await supabase
        .from("saved_items")
        .select("is_read")
        .eq("user_id", profile.id)
        .eq("content_item_id", data.content_item_id)
        .maybeSingle();
      item = toFeedItem(row as unknown as ContentItemRow, { saved: true, read: Boolean(savedRow?.is_read) });
    }
  }

  return NextResponse.json(
    { status: data.status, item, errorCode: data.error_message },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
