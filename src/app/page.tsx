import { MarkyApp } from "@/components/marky-app";
import { demoItems } from "@/lib/demo-data";

export default function Home() {
  return <MarkyApp initialItems={demoItems} demoMode={process.env.NEXT_PUBLIC_DEMO_MODE !== "false"} authEnabled={Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)} />;
}
