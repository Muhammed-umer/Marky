import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { interests } from "@/lib/types";

export async function GET() {
  const admin = createAdminSupabaseClient();
  if (!admin) {
    return NextResponse.json({
      topics: interests.map((name) => ({ id: name, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), category: "concept" })),
    });
  }

  const { data: topicRows, error } = await admin.from("topics").select("id, name, slug, category, description").order("name");
  if (error || !topicRows || topicRows.length === 0) {
    return NextResponse.json({
      topics: interests.map((name) => ({ id: name, name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), category: "concept" })),
    });
  }

  return NextResponse.json({ topics: topicRows });
}
