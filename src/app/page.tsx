import Link from "next/link";
import { BookOpen, Bookmark, Rss } from "lucide-react";
import { HeaderAuth, HeroAuthCTA } from "@/components/layout/HeaderAuth";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      {/* Editorial Header */}
      <header className="border-b border-rule bg-paper px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-vermillion" />
          <span className="font-serif text-2xl font-semibold text-charcoal tracking-tight">Marky</span>
        </div>
        <HeaderAuth />
      </header>

      {/* Main Editorial Hero */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-paper-secondary border border-rule text-xs font-medium text-charcoal-muted mb-6">
          <span className="w-2 h-2 rounded-full bg-vermillion"></span>
          Content-First Reading Platform
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold text-charcoal leading-tight mb-6">
          A calm space for your daily web reading.
        </h1>
        <p className="text-charcoal-muted text-lg sm:text-xl max-w-2xl leading-relaxed mb-10">
          Marky aggregates your favorite RSS feeds, web content, Medium articles, and topics of interest into a clean, distraction-free feed.
        </p>

        <HeroAuthCTA />

        {/* Feature Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 bg-white border border-rule rounded-lg">
            <Rss className="w-5 h-5 text-vermillion mb-3" />
            <h3 className="font-serif text-lg font-semibold text-charcoal mb-2">Multi-Source Ingestion</h3>
            <p className="text-charcoal-muted text-sm leading-relaxed">
              Parse RSS feeds, web articles, Medium posts, and custom URLs cleanly.
            </p>
          </div>
          <div className="p-6 bg-white border border-rule rounded-lg">
            <Bookmark className="w-5 h-5 text-vermillion mb-3" />
            <h3 className="font-serif text-lg font-semibold text-charcoal mb-2">Personalized Stream</h3>
            <p className="text-charcoal-muted text-sm leading-relaxed">
              Scored dynamically by your selected topic interests and content recency.
            </p>
          </div>
          <div className="p-6 bg-white border border-rule rounded-lg">
            <BookOpen className="w-5 h-5 text-vermillion mb-3" />
            <h3 className="font-serif text-lg font-semibold text-charcoal mb-2">Uncluttered Editorial</h3>
            <p className="text-charcoal-muted text-sm leading-relaxed">
              Distraction-free warm paper design system with print-friendly support.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-rule bg-paper px-6 py-6 text-center text-xs text-charcoal-muted">
        Marky &copy; {new Date().getFullYear()} — Source-Grounded Content Curation & Editorial Platform
      </footer>
    </div>
  );
}
