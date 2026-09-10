import { describe, expect, it } from "vitest";
import { planLanguagePurge, type PurgeCandidateRow } from "@/lib/language-purge";

const row = (o: Partial<PurgeCandidateRow> & { id: string; title: string }): PurgeCandidateRow => ({
  summary: null,
  bodyText: null,
  canonicalUrl: `https://medium.com/@a/${o.id}`,
  publishedAt: "2026-09-09T09:00:00Z",
  ...o,
});

const none = new Set<string>();

describe("planLanguagePurge", () => {
  it("flags the non-English rows found in the live table on 2026-09-10", () => {
    // Verbatim titles of rows stored before the gate existed.
    const items = [
      row({ id: "ko", title: "[2편] Grafana 커스텀 패널로 10만 점 산점도 그리기 — 만들고 나서야 보인 함정 3가지" }),
      row({ id: "zh", title: "課程訂閱通知" }),
      row({ id: "ru", title: "Головы против тела: одна идея, которая наконец объясняет AutoModel" }),
      row({ id: "mr", title: "Open AI ची टेस्ट, 700 पेक्षा जास्त AI Agents चा Hugging Face वर" }),
    ];
    const plan = planLanguagePurge(items, none, none);
    expect(plan.remove.map((item) => item.id)).toEqual(["ko", "zh", "ru", "mr"]);
    expect(plan.retained).toEqual([]);
  });

  it("leaves English rows alone, including one quoting another script", () => {
    const items = [
      row({ id: "en", title: "Nvidia's $12.9 Billion Hugging Face Acquisition: What It Means for AI" }),
      row({ id: "quote", title: "The model is named 通义 and it ships today with a full English guide" }),
    ];
    expect(planLanguagePurge(items, none, none)).toEqual({ remove: [], retained: [] });
  });

  it("keeps a non-English article the reader saved", () => {
    const items = [row({ id: "saved", title: "課程訂閱通知" })];
    const plan = planLanguagePurge(items, new Set(["saved"]), none);
    expect(plan.remove).toEqual([]);
    expect(plan.retained).toEqual([{ item: items[0], reason: "saved_by_reader" }]);
  });

  it("keeps a non-English article the reader submitted", () => {
    const items = [row({ id: "sub", title: "課程訂閱通知" })];
    const plan = planLanguagePurge(items, none, new Set(["sub"]));
    expect(plan.remove).toEqual([]);
    expect(plan.retained).toEqual([{ item: items[0], reason: "reader_submission" }]);
  });

  it("reports a submission before a save when the reader did both", () => {
    const items = [row({ id: "both", title: "課程訂閱通知" })];
    const plan = planLanguagePurge(items, new Set(["both"]), new Set(["both"]));
    expect(plan.retained).toEqual([{ item: items[0], reason: "reader_submission" }]);
  });
});
