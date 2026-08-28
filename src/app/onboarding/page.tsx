"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_INTERESTS } from "@/lib/constants/interests";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Check, ArrowRight, BookOpen } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>(["int-tech", "int-design"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleInterest = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      setError("Please select at least one topic of interest to personalize your feed.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/user/interests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interestIds: selectedIds }),
      });

      if (!res.ok) {
        throw new Error("Failed to save your selections.");
      }

      router.push("/feed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred while saving your preferences.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper flex flex-col items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-paper-secondary rounded-full mb-4">
            <BookOpen className="w-8 h-8 text-vermillion" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-charcoal mb-3">
            What topics interest you?
          </h1>
          <p className="text-charcoal-muted text-base max-w-md mx-auto leading-relaxed">
            Select the subjects you want to read about. Marky will prioritize articles matching your selections.
          </p>
        </div>

        {error && <Banner type="error" message={error} onClose={() => setError(null)} />}

        {/* Interest Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {DEFAULT_INTERESTS.map((interest) => {
            const isSelected = selectedIds.includes(interest.id);
            return (
              <button
                key={interest.id}
                type="button"
                onClick={() => toggleInterest(interest.id)}
                className={`p-5 rounded-lg border text-left transition-all flex items-start justify-between cursor-pointer ${
                  isSelected
                    ? "bg-white border-vermillion shadow-sm ring-1 ring-vermillion"
                    : "bg-white border-rule hover:border-charcoal-muted/40"
                }`}
              >
                <div>
                  <h3 className="font-serif font-semibold text-base text-charcoal mb-1">
                    {interest.name}
                  </h3>
                  <p className="text-xs text-charcoal-muted leading-relaxed">
                    {interest.description}
                  </p>
                </div>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isSelected ? "bg-vermillion text-white" : "border border-rule"
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Action Button */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-rule">
          <span className="text-xs text-charcoal-muted">
            {selectedIds.length} topic{selectedIds.length === 1 ? "" : "s"} selected
          </span>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? "Saving Preferences..." : "Continue to My Feed"} <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
