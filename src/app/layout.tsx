import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import "./reference.css";
import "./reference-sections.css";

export const metadata: Metadata = {
  title: "Marky — Technology worth your attention",
  description: "A calm, personalized reader for technology professionals.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children}</body>
    </html>
  );
}
