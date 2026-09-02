import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";
import type { FeedItem } from "@/lib/types";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid submission." }, { status: 400 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const { data: profile } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
  if (!profile) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  const { data, error } = await supabase.from("link_submissions").select("status,result_item,error_code").eq("id", id).eq("user_id", profile.id).single();
  if (error || !data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  return NextResponse.json({ status: data.status, item: data.result_item as FeedItem | null, errorCode: data.error_code });
}
