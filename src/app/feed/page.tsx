"use client";

import { useEffect, useState, useCallback } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { FeedItem, Interest } from "@/types/database";
import { SubmitUrlBar } from "@/components/feed/SubmitUrlBar";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Banner } from "@/components/ui/Banner";
import {
  BookOpen,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  ExternalLink,
  Filter,
  Trash2,
  SlidersHorizontal,
} from "lucide-react";

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [interests, setInterests] = useState<Interest[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [readState, setReadState] = useState<"all" | "unread" | "read">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedTopic !== "all") params.set("topic", selectedTopic);
      if (readState !== "all") params.set("readState", readState);
      if (savedOnly) params.set("savedOnly", "true");

      const res = await fetch(`/api/feed?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load your reading feed.");

      const data = await res.json();
      setItems(data.items || []);
      setInterests(data.interests || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading feed.");
    } finally {
      setLoading(false);
    }
  }, [selectedTopic, readState, savedOnly]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handleToggleSave = async (item: FeedItem) => {
    try {
      const endpoint = item.is_saved ? "/api/items/unsave" : "/api/items/save";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: item.id }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_saved: !i.is_saved } : i))
        );
      }
    } catch (err) {
      console.error("Save toggle error:", err);
    }
  };

  const handleToggleRead = async (item: FeedItem) => {
    try {
      const res = await fetch("/api/items/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: item.id, isRead: !item.is_read }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, is_read: !i.is_read } : i))
        );
      }
    } catch (err) {
      console.error("Read state toggle error:", err);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch("/api/items/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentItemId: itemId }),
      });

      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== itemId));
      }
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col">
      {/* Header */}
      <header className="border-b border-rule bg-paper px-6 py-4 flex items-center justify-between sticky top-0 z-20 no-print">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-vermillion" />
            <span className="font-serif text-2xl font-semibold text-charcoal tracking-tight">Marky</span>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/onboarding" className="text-xs text-charcoal-muted hover:text-vermillion flex items-center gap-1 font-medium">
            <SlidersHorizontal className="w-3.5 h-3.5" /> Topics
          </Link>
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-8 h-8 border border-rule",
              },
            }}
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-8">
        {/* URL Submission Bar */}
        <SubmitUrlBar onSuccess={fetchFeed} />

        {/* Filter Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-rule no-print">
          {/* Read & Saved State Toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSavedOnly(false);
                setReadState("all");
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !savedOnly && readState === "all"
                  ? "bg-charcoal text-white"
                  : "bg-paper-secondary text-charcoal-muted hover:text-charcoal border border-rule"
              }`}
            >
              All Items
            </button>
            <button
              onClick={() => {
                setSavedOnly(false);
                setReadState("unread");
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                !savedOnly && readState === "unread"
                  ? "bg-charcoal text-white"
                  : "bg-paper-secondary text-charcoal-muted hover:text-charcoal border border-rule"
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => setSavedOnly(!savedOnly)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                savedOnly
                  ? "bg-vermillion text-white"
                  : "bg-paper-secondary text-charcoal-muted hover:text-charcoal border border-rule"
              }`}
            >
              <Bookmark className="w-3 h-3" /> Saved Only
            </button>
          </div>

          {/* Topic Selector */}
          {interests.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <Filter className="w-3.5 h-3.5 text-charcoal-muted shrink-0" />
              <select
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="bg-paper-secondary border border-rule text-charcoal text-xs rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-vermillion"
              >
                <option value="all">All Interests</option>
                {interests.map((topic) => (
                  <option key={topic.id} value={topic.slug}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {error && <Banner type="error" message={error} onClose={() => setError(null)} />}

        {/* Content Stream */}
        {loading ? (
          <div className="space-y-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No reading items found"
            description="Your feed is currently empty for the selected filters. Paste a web URL above or adjust your interest preferences."
            actionLabel="Configure Interests"
            onAction={() => (window.location.href = "/onboarding")}
          />
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <Card key={item.id} className={item.is_read ? "opacity-75 bg-paper-secondary/40" : ""}>
                {/* Meta Header */}
                <div className="flex items-center justify-between gap-2 text-xs text-charcoal-muted mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default">{item.source?.title || item.author || "Web Source"}</Badge>
                    <span>&bull;</span>
                    <span>
                      {item.published_at
                        ? new Date(item.published_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Date unknown"}
                    </span>
                  </div>
                  {item.score && (
                    <span className="text-[10px] font-mono text-charcoal-muted/70 no-print">
                      Score: {item.score}
                    </span>
                  )}
                </div>

                {/* Article Title */}
                <h2 className="font-serif text-xl sm:text-2xl font-semibold text-charcoal leading-snug mb-3 hover:text-vermillion transition-colors">
                  <a href={item.canonical_url} target="_blank" rel="noopener noreferrer">
                    {item.title}
                  </a>
                </h2>

                {/* Summary / Body Preview */}
                {item.summary && (
                  <p className="text-charcoal-muted text-sm leading-relaxed mb-4 line-clamp-3">
                    {item.summary}
                  </p>
                )}

                {/* Action Bar */}
                <div className="flex items-center justify-between pt-4 border-t border-rule/60 text-xs no-print">
                  <a
                    href={item.canonical_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-vermillion font-medium hover:underline"
                  >
                    Read Original Source <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRead(item)}
                      title={item.is_read ? "Mark as unread" : "Mark as read"}
                      className={`p-1.5 rounded transition-colors ${
                        item.is_read
                          ? "text-emerald-700 bg-emerald-50"
                          : "text-charcoal-muted hover:text-charcoal hover:bg-paper-secondary"
                      }`}
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => handleToggleSave(item)}
                      title={item.is_saved ? "Unsave item" : "Save item"}
                      className={`p-1.5 rounded transition-colors ${
                        item.is_saved
                          ? "text-vermillion bg-rose-50"
                          : "text-charcoal-muted hover:text-charcoal hover:bg-paper-secondary"
                      }`}
                    >
                      {item.is_saved ? <BookmarkCheck className="w-4 h-4 text-vermillion" /> : <Bookmark className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      title="Delete item"
                      className="p-1.5 text-charcoal-muted hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
