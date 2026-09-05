import { auth } from "@clerk/nextjs/server";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase";
import { enqueueLinkSubmission, processLinkQueue } from "@/lib/submissions/queue";
import { canonicalizeUrl } from "@/lib/url";

const submissionSchema = z.object({ url: z.string().url().max(2048), note: z.string().max(2000).optional() });

export async function POST(request: Request) {
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid URL and note." }, { status: 400 });
  let submittedUrl: string;
  try { submittedUrl = canonicalizeUrl(parsed.data.url); } catch {
    return NextResponse.json({ error: "Only safe HTTP and HTTPS links are accepted." }, { status: 400 });
  }
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return NextResponse.json({ error: "Queued link processing requires live mode." }, { status: 503 });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const supabase = createAdminSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Data service unavailable." }, { status: 503 });
  const { data: profile, error: profileError } = await supabase.from("profiles").upsert({ clerk_user_id: userId, email: `${userId}@user.marky` }, { onConflict: "clerk_user_id" }).select("id").single();
  if (profileError || !profile) return NextResponse.json({ error: "Your Marky profile could not be loaded." }, { status: 502 });
  try {
    const submissionId = await enqueueLinkSubmission(supabase, profile.id as string, submittedUrl, parsed.data.note);
    after(async () => {
      const worker = createAdminSupabaseClient();
      if (worker) await processLinkQueue(worker, 1).catch(() => undefined);
    });
    return NextResponse.json({ submissionId, status: "queued" }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "The link could not be queued." }, { status: 502 });
  }
}
