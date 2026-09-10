import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { MarkyApp, PublicLanding } from "@/components/marky-app";

export const metadata: Metadata = {
  title: "Saved articles — Marky",
  description: "Your saved technology articles in Marky.",
};

export default async function SavedPage() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

  if (!demoMode) {
    if (!authEnabled) {
      return <PublicLanding authEnabled={authEnabled} />;
    }
    const { userId } = await auth();
    if (!userId) {
      return <PublicLanding authEnabled={authEnabled} />;
    }
    return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="saved" initialIsSignedIn={true} />;
  }

  return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="saved" initialIsSignedIn={false} />;
}
