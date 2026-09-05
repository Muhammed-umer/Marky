import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ accepted: true });
}
