import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { rankItems } from "@/lib/ranking";
import { interests, type FeedView, type Interest } from "@/lib/types";
import { createAdminSupabaseClient, createUserSupabaseClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const view = (request.nextUrl.searchParams.get("view") ?? "for-you") as FeedView;
  if (!new Set(["for-you", "trending", "latest"]).has(view)) return NextResponse.json({ error: "Invalid view." }, { status: 400 });
  const selected = interests.slice(0, 3) as unknown as Interest[];
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ items: rankItems(demoItems, view, selected), nextCursor: null, demo: true });
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  if (admin) await admin.from("profiles").upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" });
  const supabase = createUserSupabaseClient(() => getToken());
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const { data, error } = await supabase.from("content_items").select("id,title,summary,canonical_url,author,published_at,publication_time_status,sources(name),content_item_sources(count),content_item_interests(interests(name))").order("published_at", { ascending: false, nullsFirst: false }).limit(30);
  if (error) return NextResponse.json({ error: "Feed could not be loaded." }, { status: 502 });
  return NextResponse.json({ items: data, nextCursor: null });
}
