import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";

const saveTopicsSchema = z.object({
  topicIds: z.array(z.string().uuid()).optional(),
  topicNames: z.array(z.string()).optional(),
});

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = createAdminSupabaseClient();
  if (!admin) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({ clerk_user_id: userId, email: `${userId}@user.marky` }, { onConflict: "clerk_user_id" })
    .select("id, onboarded")
    .single();
  if (profileError || !profile) {
    console.error("[User Topics API] Profile load error:", profileError);
    return NextResponse.json({ error: "Profile unavailable.", details: profileError?.message }, { status: 502 });
  }

  const { data: rows, error: topicsError } = await admin
    .from("user_topics")
    .select("topic_id, topic:topics(id, name, slug, category)")
    .eq("user_id", profile.id);

  if (topicsError) {
    console.error("[User Topics API] Failed to load user topics:", topicsError);
    return NextResponse.json({ error: "Failed to load user topics.", details: topicsError.message }, { status: 502 });
  }

  const topicsList = (rows ?? []).map((row) => {
    const t = Array.isArray(row.topic) ? row.topic[0] : row.topic;
    return t;
  }).filter(Boolean);

  return NextResponse.json({
    topics: topicsList,
    onboarded: profile.onboarded ?? false,
  });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = saveTopicsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid topic payload." }, { status: 400 });

  const admin = createAdminSupabaseClient();
  if (!admin) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .upsert({ clerk_user_id: userId, email: `${userId}@user.marky` }, { onConflict: "clerk_user_id" })
    .select("id")
    .single();
  if (profileError || !profile) {
    console.error("[User Topics API] Profile upsert error on POST:", profileError);
    return NextResponse.json({ error: "Profile unavailable.", details: profileError?.message }, { status: 502 });
  }

  let targetTopicIds: string[] = [];

  if (parsed.data.topicIds && parsed.data.topicIds.length > 0) {
    targetTopicIds = parsed.data.topicIds;
  } else if (parsed.data.topicNames && parsed.data.topicNames.length > 0) {
    const { data: matchedTopics } = await admin
      .from("topics")
      .select("id, name")
      .in("name", parsed.data.topicNames);
    targetTopicIds = (matchedTopics ?? []).map((t) => t.id);
  }

  // A selection that matches nothing is a bad request, not "follow nothing":
  // an empty user_topics sends the reader back to onboarding.
  if (targetTopicIds.length === 0) {
    return NextResponse.json({ error: "Select at least one known topic." }, { status: 400 });
  }

  // Add the new selection first, then drop what it no longer contains. The two
  // steps are not one transaction, so the order is what keeps a reader from
  // ending up with no topics: if the insert fails (an unknown topicId, say)
  // the old selection is untouched, and if the delete fails they hold the
  // union rather than nothing.
  const { error: upsertError } = await admin
    .from("user_topics")
    .upsert(
      targetTopicIds.map((topicId) => ({ user_id: profile.id, topic_id: topicId })),
      { onConflict: "user_id,topic_id", ignoreDuplicates: true },
    );
  if (upsertError) {
    console.error("[User Topics API] Failed to insert user topics:", upsertError);
    return NextResponse.json({ error: "Failed to persist topic preferences." }, { status: 502 });
  }

  const { error: deleteError } = await admin
    .from("user_topics")
    .delete()
    .eq("user_id", profile.id)
    .not("topic_id", "in", `(${targetTopicIds.join(",")})`);
  if (deleteError) {
    console.error("[User Topics API] Failed to remove deselected topics:", deleteError);
    return NextResponse.json({ error: "Failed to persist topic preferences." }, { status: 502 });
  }

  // Onboarded only once a selection is actually stored.
  await admin.from("profiles").update({ onboarded: true, updated_at: new Date().toISOString() }).eq("id", profile.id);

  // Fetch updated topics
  const { data: updatedRows } = await admin
    .from("user_topics")
    .select("topic:topics(id, name, slug, category)")
    .eq("user_id", profile.id);

  const updatedTopics = (updatedRows ?? []).map((r) => Array.isArray(r.topic) ? r.topic[0] : r.topic).filter(Boolean);

  return NextResponse.json({
    success: true,
    topics: updatedTopics,
  });
}
