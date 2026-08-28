import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getAdminSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getAdminSupabase();

    // Fetch user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) {
      return NextResponse.json({ profile: null, selectedInterestIds: [] });
    }

    // Fetch user selected interests
    const { data: userInterests } = await supabase
      .from("user_interests")
      .select("interest_id")
      .eq("user_id", profile.id);

    const selectedInterestIds = (userInterests || []).map((ui) => ui.interest_id);

    return NextResponse.json({
      profile,
      selectedInterestIds,
    });
  } catch (error) {
    console.error("Error fetching user interests:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    const user = await currentUser();

    if (!userId || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { interestIds } = await req.json();

    if (!Array.isArray(interestIds)) {
      return NextResponse.json({ error: "Invalid interestIds payload" }, { status: 400 });
    }

    const supabase = getAdminSupabase();

    const email = user.emailAddresses[0]?.emailAddress || "";
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.username || "Marky Reader";
    const avatarUrl = user.imageUrl || null;

    // Upsert Profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .upsert(
        {
          clerk_user_id: userId,
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          onboarded: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clerk_user_id" }
      )
      .select()
      .single();

    if (profileError || !profile) {
      console.error("Profile upsert error:", profileError);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    // Clear existing interests and insert new selections
    await supabase.from("user_interests").delete().eq("user_id", profile.id);

    if (interestIds.length > 0) {
      const inserts = interestIds.map((id: string) => ({
        user_id: profile.id,
        interest_id: id,
      }));
      await supabase.from("user_interests").insert(inserts);
    }

    return NextResponse.json({ success: true, profile });
  } catch (error) {
    console.error("Error saving user interests:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
