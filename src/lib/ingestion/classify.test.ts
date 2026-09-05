import { describe, expect, it } from "vitest";
import { classifyContent } from "@/lib/ingestion/classify";

describe("classifyContent", () => {
  it("returns deterministic interest matches", () => {
    const matches = classifyContent("Building an OpenAI agent with TypeScript on GitHub", "A developer guide to models and GitHub actions", "GitHub Blog");
    expect(matches.map((match) => match.name)).toContain("TypeScript");
    expect(matches.map((match) => match.name)).toContain("OpenAI");
    expect(matches.every((match) => match.confidence >= 0 && match.confidence <= 1)).toBe(true);
  });

  it("associates configured publisher content with its entity topic", () => {
    const matches = classifyContent("Introducing a new OpenAI developer tool", "A release for the OpenAI platform.", "OpenAI News");
    expect(matches[0]).toMatchObject({ name: "OpenAI", confidence: expect.any(Number) });
  });
});
