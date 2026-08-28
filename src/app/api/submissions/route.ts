import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { canonicalizeUrl, urlHash } from "@/lib/url";

const submissionSchema = z.object({ url: z.string().url().max(2048), note: z.string().max(2000).optional() });

export async function POST(request: Request) {
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid URL and note." }, { status: 400 });
  let canonicalUrl: string;
  try { canonicalUrl = canonicalizeUrl(parsed.data.url); } catch { return NextResponse.json({ error: "Only safe HTTP and HTTPS links are accepted." }, { status: 400 }); }
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ id: crypto.randomUUID(), canonicalUrl, saved: true, demo: true }, { status: 201 });
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const host = new URL(canonicalUrl).hostname.replace(/^www\./, "");
  const { data: profile } = await supabase.from("profiles").select("id").eq("clerk_user_id", userId).single();
  if (!profile) return NextResponse.json({ error: "Complete onboarding before saving links." }, { status: 409 });
  const { data: item, error: itemError } = await supabase.from("content_items").upsert({ canonical_url: canonicalUrl, url_hash: urlHash(canonicalUrl), title: host, publication_time_status: "unknown" }, { onConflict: "url_hash" }).select("id").single();
  if (itemError || !item) return NextResponse.json({ error: "The link could not be saved." }, { status: 502 });
  const { error } = await supabase.from("saved_items").insert({ user_id: profile.id, content_item_id: item.id, note: parsed.data.note });
  if (error?.code === "23505") return NextResponse.json({ error: "This link is already saved." }, { status: 409 });
  if (error) return NextResponse.json({ error: "The link could not be saved." }, { status: 502 });
  return NextResponse.json({ id: item.id, canonicalUrl, saved: true }, { status: 201 });
}
