import { describe, expect, it } from "vitest";
import { classifyContent } from "@/lib/ingestion/classify";

describe("classifyContent", () => {
  it("returns deterministic interest matches", () => {
    const matches = classifyContent("Building an OpenAI agent with TypeScript on GitHub", "A developer guide to models and GitHub actions");
    expect(matches.map((match) => match.name)).toContain("TypeScript");
    expect(matches.map((match) => match.name)).toContain("OpenAI");
    expect(matches.every((match) => match.confidence >= 0 && match.confidence <= 1)).toBe(true);
  });

  it("associates configured publisher content with its entity topic", () => {
    const matches = classifyContent("Introducing a new OpenAI developer tool", "A release for the OpenAI platform.");
    expect(matches[0]).toMatchObject({ name: "OpenAI", confidence: expect.any(Number) });
  });

  it("matches keywords found only in the body text", () => {
    const matches = classifyContent("A quiet release", null, "The team shipped a new Supabase integration this week.");
    expect(matches.map((match) => match.name)).toContain("Supabase");
  });

  it("does not tag an off-topic post with the publisher's own topic", () => {
    // The real regression: "Google Blog" used to be part of the haystack, so
    // every item it published matched the Google topic on the source name.
    const matches = classifyContent("Supporting independent journalism in Ukraine", "How we are funding newsrooms.");
    expect(matches.map((match) => match.name)).not.toContain("Google / Google DeepMind");
    expect(matches).toHaveLength(0);
  });
});
