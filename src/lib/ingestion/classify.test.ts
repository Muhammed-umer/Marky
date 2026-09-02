import { describe, expect, it } from "vitest";
import { classifyContent } from "@/lib/ingestion/classify";

describe("classifyContent", () => {
  it("returns deterministic interest matches", () => {
    const matches = classifyContent("Building an AI agent with TypeScript", "A developer guide to models and APIs", "Medium · Artificial Intelligence");
    expect(matches.map((match) => match.name)).toContain("Artificial Intelligence");
    expect(matches.map((match) => match.name)).toContain("Programming");
    expect(matches.every((match) => match.confidence >= 0 && match.confidence <= 1)).toBe(true);
  });
});
