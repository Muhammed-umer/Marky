import { describe, expect, it } from "vitest";
import { leadingInterests, matchesSelectedInterests, orderInterestsBySelection } from "@/lib/feed-relevance";
import type { Interest } from "@/lib/types";

const nvidiaMoat = {
  title: "Beyond the Silicon: Why NVIDIA's True AI Moat Isn't Hardware",
  excerpt: "Ask almost anyone in tech what NVIDIA does and they will say it sells GPUs. OpenAI buys them.",
  interests: ["NVIDIA", "OpenAI"] as Interest[],
};

const openAiAttack = {
  title: "What we're learning from OpenAI's attack on Hugging Face",
  excerpt: "Citing among the examples OpenAI's attack on the hub.",
  interests: ["Hugging Face", "OpenAI"] as Interest[],
};

describe("leadingInterests", () => {
  it("returns the highest-confidence topic, not every mention", () => {
    expect(leadingInterests(nvidiaMoat.title, nvidiaMoat.excerpt)).toEqual(["NVIDIA"]);
  });

  it("is empty when nothing in title or summary matches", () => {
    expect(leadingInterests("A quiet week in software", "Nothing much happened.")).toEqual([]);
  });
});

describe("matchesSelectedInterests", () => {
  it("drops a story that only name-drops the selected topic", () => {
    expect(matchesSelectedInterests(nvidiaMoat, ["OpenAI"])).toBe(false);
  });

  it("keeps a story the selected topic leads", () => {
    expect(matchesSelectedInterests(openAiAttack, ["OpenAI"])).toBe(true);
  });

  it("keeps the story for the topic it is actually about", () => {
    expect(matchesSelectedInterests(nvidiaMoat, ["NVIDIA"])).toBe(true);
  });

  it("falls back to stored topics when the text carries no keyword", () => {
    const bodyClassified = { title: "A quiet week in software", excerpt: "Nothing much happened.", interests: ["OpenAI"] as Interest[] };
    expect(matchesSelectedInterests(bodyClassified, ["OpenAI"])).toBe(true);
    expect(matchesSelectedInterests(bodyClassified, ["NVIDIA"])).toBe(false);
  });

  it("keeps everything when no topic is selected", () => {
    expect(matchesSelectedInterests(nvidiaMoat, [])).toBe(true);
  });
});

describe("orderInterestsBySelection", () => {
  it("puts the reader's topics first so the pill names one of them", () => {
    expect(orderInterestsBySelection(["Hugging Face", "OpenAI"], ["OpenAI"])).toEqual(["OpenAI", "Hugging Face"]);
  });

  it("leaves order alone when nothing is selected", () => {
    expect(orderInterestsBySelection(["Hugging Face", "OpenAI"], [])).toEqual(["Hugging Face", "OpenAI"]);
  });
});
