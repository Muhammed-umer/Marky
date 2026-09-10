import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";

/**
 * The article body for the brief. Kept off the feed response on purpose: a
 * body is up to 20k characters and the feed returns thirty items, so it is
 * loaded only for the one the reader opened.
 *
 * Content items are global, not per-user, so there is no ownership filter --
 * but the route still requires a signed-in user, like every other live route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid item." }, { status: 400 });

  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ error: "Article bodies are not available in demo mode." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data, error } = await supabase
    .from("content_items")
    .select("id,canonical_url,body_content,word_count")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Article could not be loaded." }, { status: 502 });
  if (!data) return NextResponse.json({ error: "Item not found." }, { status: 404 });

  return NextResponse.json(
    {
      id: data.id,
      url: data.canonical_url,
      // Null when nothing was extracted. The client shows the summary and the
      // link to the original in that case; it does not fabricate a body.
      bodyText: data.body_content ?? null,
      wordCount: typeof data.word_count === "number" ? data.word_count : null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
