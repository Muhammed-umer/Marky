import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { demoItems } from "@/lib/demo-data";
import { rankItems, type InterestAffinity } from "@/lib/ranking";
import { interests, type FeedItem, type FeedView, type Interest } from "@/lib/types";
import { createAdminSupabaseClient } from "@/lib/supabase";

interface ContentRow {
  id: string;
  title: string;
  summary: string | null;
  canonical_url: string;
  author: string | null;
  published_at: string | null;
  image_url: string | null;
  engagement_count: number;
  primary_source: { name: string } | Array<{ name: string }> | null;
  content_item_sources: Array<{ source_id: string }> | null;
  content_item_interests: Array<{ interest: { name: string } | Array<{ name: string }> | null }> | null;
}

function relationName(value: { name: string } | Array<{ name: string }> | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

export async function GET(request: NextRequest) {
  const view = (request.nextUrl.searchParams.get("view") ?? "for-you") as FeedView;
  if (!new Set(["for-you", "trending", "latest"]).has(view)) return NextResponse.json({ error: "Invalid view." }, { status: 400 });
  const defaultInterests = interests.slice(0, 3) as unknown as Interest[];
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "false") return NextResponse.json({ items: rankItems(demoItems, view, defaultInterests), nextCursor: null, demo: true });
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || !process.env.CLERK_SECRET_KEY) {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const admin = createAdminSupabaseClient();
  if (!admin) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data: profile, error: profileError } = await admin.from("profiles").upsert({ clerk_user_id: userId }, { onConflict: "clerk_user_id" }).select("id").single();
  if (profileError || !profile) return NextResponse.json({ error: "User profile could not be loaded." }, { status: 502 });

  const contentSelection = "id,title,summary,canonical_url,author,published_at,image_url,engagement_count,primary_source:sources!content_items_primary_source_id_fkey(name),content_item_sources(source_id),content_item_interests(interest:interests(name))";
  const [{ data: savedRows, error: savedError }, { data: affinityRows, error: affinityError }] = await Promise.all([
    admin.from("saved_items").select("content_item_id,is_read").eq("user_id", profile.id),
    admin.from("user_interest_affinities").select("score,interest:interests(name)").eq("user_id", profile.id),
  ]);
  if (savedError || affinityError) return NextResponse.json({ error: "Feed could not be loaded." }, { status: 502 });

  const savedByItem = new Map((savedRows ?? []).map((row) => [row.content_item_id as string, Boolean(row.is_read)]));
  const savedIds = [...savedByItem.keys()];
  const [{ data: recentRows, error: recentError }, savedContentResult] = await Promise.all([
    admin.from("content_items").select(contentSelection).order("published_at", { ascending: false, nullsFirst: false }).limit(200),
    savedIds.length
      ? admin.from("content_items").select(contentSelection).in("id", savedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (recentError || savedContentResult.error) return NextResponse.json({ error: "Feed could not be loaded." }, { status: 502 });

  const contentById = new Map<string, ContentRow>();
  for (const row of [...(recentRows ?? []), ...(savedContentResult.data ?? [])] as unknown as ContentRow[]) contentById.set(row.id, row);
  const contentRows = [...contentById.values()];
  const recentCutoff = Date.now() - 45 * 86_400_000;
  const items: FeedItem[] = contentRows.filter((row) => {
    const published = row.published_at ? Date.parse(row.published_at) : Number.NaN;
    return savedByItem.has(row.id) || (!Number.isNaN(published) && published >= recentCutoff);
  }).map((row) => {
    const itemInterests = (row.content_item_interests ?? []).flatMap((link) => {
      const name = relationName(link.interest);
      return interests.includes(name as Interest) ? [name as Interest] : [];
    });
    const sourceCount = Math.max(1, row.content_item_sources?.length ?? 0);
    return {
      id: row.id,
      title: row.title,
      excerpt: row.summary ?? "Open the original source to read this story.",
      url: row.canonical_url,
      source: relationName(row.primary_source) ?? new URL(row.canonical_url).hostname,
      author: row.author ?? "Unknown author",
      publishedAt: row.published_at,
      imageUrl: row.image_url,
      engagementCount: row.engagement_count,
      interests: itemInterests,
      sourceCount,
      saved: savedByItem.has(row.id),
      read: savedByItem.get(row.id) ?? false,
      explanation: [itemInterests[0] ? `Matches ${itemInterests[0]}` : "Technology source", sourceCount > 1 ? `From ${sourceCount} tracked sources` : "From a tracked source"],
    };
  });

  const affinity = (affinityRows ?? []).reduce<InterestAffinity>((result, row) => {
    const name = relationName(row.interest as { name: string } | Array<{ name: string }> | null);
    if (interests.includes(name as Interest)) result[name as Interest] = Number(row.score);
    return result;
  }, {});

  const ordered = rankItems(items, view, defaultInterests, affinity);
  const savedFirst = view === "for-you"
    ? [...ordered.filter((item) => item.saved), ...ordered.filter((item) => !item.saved)]
    : ordered;
  const ranked = savedFirst.slice(0, 30).map((item) => {
    const strongest = item.interests.toSorted((a, b) => (affinity[b] ?? 0) - (affinity[a] ?? 0))[0];
    return strongest && (affinity[strongest] ?? 0) > 0.5
      ? { ...item, explanation: [`Because you read ${strongest}`, ...item.explanation.slice(0, 1)] }
      : item;
  });
  return NextResponse.json(
    { items: ranked, nextCursor: null, personalized: Object.keys(affinity).length > 0 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
