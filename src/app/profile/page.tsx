import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { MarkyApp, PublicLanding } from "@/components/marky-app";

export const metadata: Metadata = {
  title: "Your Profile — Marky",
  description: "Manage your Marky profile and reading preferences.",
};

export default async function ProfilePage() {
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
    return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="profile" initialIsSignedIn={true} />;
  }

  return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="profile" initialIsSignedIn={false} />;
}
