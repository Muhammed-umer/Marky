import { interests, type Interest } from "@/lib/types";

const keywords: Record<Interest, string[]> = {
  "Artificial Intelligence": ["ai", "artificial intelligence", "machine learning", "llm", "model", "agent", "neural"],
  Programming: ["programming", "developer", "javascript", "typescript", "python", "rust", "java", "code", "api"],
  "Software Engineering": ["software engineering", "architecture", "testing", "reliability", "devops", "system design"],
  Cybersecurity: ["security", "cybersecurity", "vulnerability", "malware", "privacy", "zero trust", "authentication"],
  Startups: ["startup", "founder", "venture", "funding", "product market", "saas"],
  "Cloud Computing": ["cloud", "aws", "azure", "gcp", "kubernetes", "serverless", "distributed"],
  "Data Science": ["data science", "analytics", "statistics", "database", "data engineering", "warehouse"],
  "Developer Tools": ["developer tools", "ide", "editor", "cli", "sdk", "git", "tooling"],
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
