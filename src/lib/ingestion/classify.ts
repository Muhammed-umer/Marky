import { interests, type Interest } from "@/lib/types";

/**
 * Shared with the feed's read-time relevance check, which has to recover which
 * topic a stored item actually leads (see `src/lib/feed-relevance.ts`).
 */
export const interestKeywords: Record<Interest, string[]> = {
  OpenAI: ["openai", "chatgpt", "gpt-", "codex", "sora"],
  "Hugging Face": ["hugging face", "huggingface", "transformers", "spaces"],
  NVIDIA: ["nvidia", "cuda", "geforce", "dgx"],
  "Google / Google DeepMind": ["google", "deepmind", "gemini", "tensorflow"],
  Vercel: ["vercel", "turbopack", "ai sdk"],
  Supabase: ["supabase"],
  Resend: ["resend"],
  "Next.js": ["next.js", "nextjs"],
  React: ["react", "reactjs"],
  TypeScript: ["typescript", "tsconfig"],
  GitHub: ["github", "github actions", "github copilot"],
  Neon: ["neon", "neon postgres"],
};

export interface InterestMatch {
  name: Interest;
  confidence: number;
}

/**
 * Matches on the content itself. The source name is deliberately excluded: it
 * used to be part of the haystack, which tagged every "Google Blog" item with
 * the Google topic regardless of subject. A source's own topics now come from
 * the source_topics table instead.
 */
export function classifyContent(title: string, summary: string | null, bodyText: string | null = null): InterestMatch[] {
  const haystack = `${title} ${summary ?? ""} ${bodyText ?? ""}`.toLowerCase();
  const matches = interests.flatMap((name) => {
    const count = interestKeywords[name].reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
    if (!count) return [];
    return [{ name, confidence: Math.min(1, 0.55 + count * 0.15) }];
  });
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
