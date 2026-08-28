import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marky — Content Curation & Reading Feed",
  description: "A calm, intelligent, editorial environment for reading, bookmarking, and managing web content.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-paper text-charcoal min-h-screen antialiased selection:bg-vermillion selection:text-white">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
