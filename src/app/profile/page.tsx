import type { Metadata } from "next";
import { MarkyApp } from "@/components/marky-app";
import { demoItems } from "@/lib/demo-data";

export const metadata: Metadata = {
  title: "Profile — Marky",
  description: "Your Marky account and reading profile.",
};

export default function ProfilePage() {
  const authEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false" || !authEnabled;
  return <MarkyApp initialItems={demoItems} demoMode={demoMode} authEnabled={authEnabled} initialPage="profile" />;
}
