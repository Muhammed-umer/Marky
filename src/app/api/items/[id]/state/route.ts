import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";

const stateSchema = z.object({ saved: z.boolean().optional(), read: z.boolean().optional() }).refine((value) => value.saved !== undefined || value.read !== undefined);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid item." }, { status: 400 });
  const parsed = stateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid state." }, { status: 400 });
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ ...parsed.data, demo: true });

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
  if (profileError || !profile) return NextResponse.json({ error: "Profile unavailable." }, { status: 502 });

  if (parsed.data.saved === false) {
    const { error } = await supabase.from("saved_items").delete().eq("user_id", profile.id).eq("content_item_id", id);
    if (error) return NextResponse.json({ error: "Item state could not be updated." }, { status: 502 });
    return NextResponse.json({ saved: false, read: false });
  }

  const { data: current } = await supabase.from("saved_items").select("is_read").eq("user_id", profile.id).eq("content_item_id", id).maybeSingle();
  const isRead = parsed.data.read ?? Boolean(current?.is_read);
  const { error } = await supabase.from("saved_items").upsert({ user_id: profile.id, content_item_id: id, is_read: isRead }, { onConflict: "user_id,content_item_id" });
  if (error) return NextResponse.json({ error: "Item state could not be updated." }, { status: 502 });
  return NextResponse.json({ saved: true, read: isRead });
}
