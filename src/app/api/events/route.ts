import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";

const eventSchema = z.object({
  clientEventId: z.string().uuid(),
  contentItemId: z.string().uuid(),
  type: z.enum(["impression", "open", "save", "unsave", "mark_read", "mark_unread", "complete", "dismiss"]),
  dwellSeconds: z.number().int().min(0).max(86_400).optional(),
  completionRatio: z.number().min(0).max(1).optional(),
});

export async function POST(request: Request) {
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ accepted: true, demo: true });

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" })
    .select("id")
    .single();
  if (profileError || !profile) return NextResponse.json({ error: "Profile unavailable." }, { status: 502 });

  const { data: recorded, error } = await supabase.rpc("record_content_event", {
    p_client_event_id: parsed.data.clientEventId,
    p_user_id: profile.id,
    p_content_item_id: parsed.data.contentItemId,
    p_event_type: parsed.data.type,
    p_dwell_seconds: parsed.data.dwellSeconds ?? null,
    p_completion_ratio: parsed.data.completionRatio ?? null,
  });
  if (error) return NextResponse.json({ error: "Event could not be recorded." }, { status: 502 });
  return NextResponse.json({ accepted: Boolean(recorded) });
}
