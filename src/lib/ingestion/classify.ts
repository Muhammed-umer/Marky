import { interests, type Interest } from "@/lib/types";

const keywords: Record<Interest, string[]> = {
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

export function classifyContent(title: string, summary: string | null, sourceName: string): InterestMatch[] {
  const haystack = `${title} ${summary ?? ""} ${sourceName}`.toLowerCase();
  const matches = interests.flatMap((name) => {
    const count = keywords[name].reduce((total, keyword) => total + (haystack.includes(keyword) ? 1 : 0), 0);
    if (!count) return [];
    return [{ name, confidence: Math.min(1, 0.55 + count * 0.15) }];
  });
  return matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}
