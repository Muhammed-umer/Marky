import { describe, expect, it } from "vitest";
import { isPlaceholderImageUrl, mediumImageUrl, safeImageUrl } from "@/lib/ingestion/rss";

// Verbatim from a stored row on 2026-09-10. Three sampled da:true images came
// back byte-identical at 17,893 bytes, 1200x630 -- one file meaning "no image".
const MEDIUM_PLACEHOLDER =
  "https://miro.medium.com/v2/da:true/bc1f8416df0cad099e43cda2872716e5864f18a73bda2a7547ea082aca9b5632";
const REAL_MEDIUM = "https://miro.medium.com/v2/resize:fit:1200/1*abcdef.jpeg";

describe("isPlaceholderImageUrl", () => {
  it("catches Medium's generated stand-in", () => {
    expect(isPlaceholderImageUrl(MEDIUM_PLACEHOLDER)).toBe(true);
  });

  it("leaves a real article image alone", () => {
    expect(isPlaceholderImageUrl(REAL_MEDIUM)).toBe(false);
    expect(isPlaceholderImageUrl("https://blogs.nvidia.com/wp-content/uploads/2026/09/hero.jpg")).toBe(false);
  });

  it("catches tracking pixels and spacers", () => {
    expect(isPlaceholderImageUrl("https://example.com/img/1x1.gif")).toBe(true);
    expect(isPlaceholderImageUrl("https://example.com/assets/spacer.png")).toBe(true);
    expect(isPlaceholderImageUrl("https://medium.com/_/stat?event=post.clientViewed")).toBe(true);
  });

  it("catches avatar-sized crops but keeps story-sized ones", () => {
    expect(isPlaceholderImageUrl("https://miro.medium.com/v2/resize:fill:64:64/1*x.png")).toBe(true);
    expect(isPlaceholderImageUrl("https://miro.medium.com/v2/resize:fit:720/1*x.png")).toBe(false);
  });

  it("does not reject a filename that merely contains a keyword", () => {
    expect(isPlaceholderImageUrl("https://example.com/pixel-art-tutorial-hero.png")).toBe(false);
  });
});

describe("the image helpers refuse placeholders", () => {
  it("safeImageUrl returns null so the card falls back to text-only", () => {
    expect(safeImageUrl(MEDIUM_PLACEHOLDER)).toBeNull();
    expect(safeImageUrl(REAL_MEDIUM)).toBe(REAL_MEDIUM);
  });

  it("mediumImageUrl applies the same guard, since it bypasses safeImageUrl", () => {
    expect(mediumImageUrl(MEDIUM_PLACEHOLDER)).toBeNull();
    expect(mediumImageUrl(REAL_MEDIUM)).toBe(REAL_MEDIUM);
  });
});
