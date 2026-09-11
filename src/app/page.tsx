import { auth } from "@clerk/nextjs/server";
import { MarkyApp, PublicLanding } from "@/components/marky-app";
import { demoItems } from "@/lib/demo-data";

export default async function Home() {
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
    return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="home" initialIsSignedIn={true} />;
  }

  // Demo mode serves the bundled items; the feed route is never called.
  return <MarkyApp demoMode={demoMode} authEnabled={authEnabled} initialPage="home" initialItems={demoItems} initialIsSignedIn={false} />;
}
