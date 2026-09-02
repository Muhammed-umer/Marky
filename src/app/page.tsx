import { MarkyApp } from "@/components/marky-app";
import { demoItems } from "@/lib/demo-data";

export default function Home() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || !authEnabled;
  return <MarkyApp initialItems={demoItems} demoMode={demoMode} authEnabled={authEnabled} initialPage="home" />;
}
