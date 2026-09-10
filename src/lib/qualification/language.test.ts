import { describe, expect, it } from "vitest";
import { englishStopwordRatio, isLikelyNonEnglish, nonLatinRatio } from "@/lib/qualification/reject";
import { qualifyCandidate } from "@/lib/qualification";
import type { QualificationCandidate, QualificationContext } from "@/lib/qualification/types";

function candidate(overrides: Partial<QualificationCandidate> = {}): QualificationCandidate {
  return {
    title: "Next.js 16 introduces partial prerendering",
    summary: "A walkthrough of the new rendering mode.",
    bodyText: "The team has shipped a new rendering mode and this is how it works in practice. "
      + "You can adopt it for your own routes when you are ready, and the guide below shows what "
      + "changes and why it matters for the pages that you already have in production today.",
    canonicalUrl: "https://medium.com/@a/next-16",
    publishedAt: "2026-09-09T09:00:00Z",
    ...overrides,
  };
}
const context = (o: Partial<QualificationContext> = {}): QualificationContext =>
  ({ aliases: ["next.js", "nextjs"], trust: "community", now: new Date("2026-09-09T12:00:00Z"), ...o });

describe("nonLatinRatio", () => {
  it("is zero for plain English", () => expect(nonLatinRatio("Hello world")).toBe(0));
  it("is high for Devanagari", () => expect(nonLatinRatio("ची टेस्ट पेक्षा जास्त")).toBeGreaterThan(0.9));
  it("stays low when English merely quotes another script", () => {
    expect(nonLatinRatio("The model is named 通义 and it ships today with a full English guide")).toBeLessThan(0.2);
  });
});

describe("isLikelyNonEnglish", () => {
  it("rejects the real Marathi title that reached the feed", () => {
    // Verbatim from a row ingested on 2026-09-09 under the OpenAI topic.
    expect(isLikelyNonEnglish(candidate({
      title: "Open AI ची टेस्ट, 700 पेक्षा जास्त AI Agents चा Hugging Face वर",
      summary: null,
      bodyText: null,
    }))).toBe(true);
  });

  it("catches a foreign title even when Latin boilerplate dilutes the body", () => {
    // The regression this exists for. All three of these are verbatim from rows
    // stored on 2026-09-09; each scored only 0.14-0.19 across title+summary and
    // would have survived a combined-text check.
    const cases = [
      "Open AI ची टेस्ट, 700 पेक्षा जास्त AI Agents चा Hugging Face वर",
      "Головы против тела: одна идея, которая наконец объясняет AutoModel",
      "課程訂閱通知",
    ];
    for (const title of cases) {
      expect(isLikelyNonEnglish(candidate({
        title,
        summary: "Read more on Medium. Published by the author. Tags: AI, OpenAI, Hugging Face.",
        bodyText: null,
      }))).toBe(true);
    }
  });

  it("is not fooled by curly quotes in English titles", () => {
    // These sit above U+024F too, but they are punctuation, not script.
    expect(isLikelyNonEnglish(candidate({
      title: "10 Git Commands That Separate “I Use Git” From “I Understand Git”",
      summary: null,
      bodyText: null,
    }))).toBe(false);
  });

  it("keeps a normal English article", () => {
    expect(isLikelyNonEnglish(candidate())).toBe(false);
  });

  it("does not judge a short title with no body", () => {
    // Too little Latin text to measure; the substance floor handles these.
    expect(isLikelyNonEnglish(candidate({ title: "GPT-5 ships", summary: null, bodyText: null }))).toBe(false);
  });

  it("catches Latin-script prose that is not English", () => {
    const spanish = "Esta guia explica como usar el nuevo modo de renderizado en tus rutas, "
      + "porque cambia la forma en que las paginas se generan, cuando conviene adoptarlo, "
      + "y que problemas resuelve para los equipos que ya tienen aplicaciones en produccion hoy.";
    expect(isLikelyNonEnglish(candidate({ summary: null, bodyText: spanish }))).toBe(true);
  });

  it("does not punish English that is dense with code", () => {
    const codey = candidate({
      bodyText: "You can install it with npm install next and then you should update the config "
        + "so that the router knows what to do, and after that the build will work as you expect it to.",
    });
    expect(isLikelyNonEnglish(codey)).toBe(false);
  });
});

describe("englishStopwordRatio", () => {
  it("is high for English prose", () => {
    expect(englishStopwordRatio("this is the guide that you can use for your own app")).toBeGreaterThan(0.4);
  });
});

describe("the gate", () => {
  it("reports non_english as the reason, so the log says why", () => {
    const result = qualifyCandidate(
      candidate({ title: "Open AI ची टेस्ट, 700 पेक्षा जास्त AI Agents चा", summary: null, bodyText: null }),
      context(),
    );
    expect(result).toMatchObject({ accepted: false, reason: "non_english" });
  });

  it("still accepts a good English community article", () => {
    expect(qualifyCandidate(candidate({ bodyText: "word ".repeat(500) }), context()).accepted).toBe(true);
  });
});
