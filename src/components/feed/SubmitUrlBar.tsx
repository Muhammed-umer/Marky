"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Link2, Plus, Loader2 } from "lucide-react";

export interface SubmitUrlBarProps {
  onSuccess?: () => void;
}

export const SubmitUrlBar: React.FC<SubmitUrlBarProps> = ({ onSuccess }) => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/ingestion/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to extract content.");
      }

      setMessage({ type: "success", text: "Content extracted and saved to your collection!" });
      setUrl("");
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to extract URL content." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-rule rounded-lg p-4 shadow-sm mb-8">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Link2 className="w-4 h-4 text-charcoal-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste any article or web page URL to save (e.g. https://...)"
            required
            className="w-full pl-10 pr-4 py-2.5 bg-paper border border-rule rounded-md text-sm text-charcoal placeholder:text-charcoal-muted focus:outline-none focus:ring-2 focus:ring-vermillion focus:border-transparent transition-all"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={loading || !url.trim()}
          className="w-full sm:w-auto shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-1.5" /> Save URL
            </>
          )}
        </Button>
      </form>

      {message && (
        <div
          className={`mt-3 text-xs font-medium px-3 py-1.5 rounded-md ${
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};
