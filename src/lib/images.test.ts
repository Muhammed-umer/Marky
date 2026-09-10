import { describe, expect, it } from "vitest";
import { thumbnailUrl } from "@/lib/images";

const CDN = "https://cdn-images-1.medium.com/max/1200/1*iFUhrtR1BFQtYuCIeP3BYw.png";
const MIRO = "https://miro.medium.com/v2/resize:fit:1400/1*abc.jpeg";

describe("thumbnailUrl", () => {
  it("narrows a full-resolution Medium image to the slot size", () => {
    expect(thumbnailUrl(CDN, 400)).toBe("https://cdn-images-1.medium.com/max/400/1*iFUhrtR1BFQtYuCIeP3BYw.png");
  });

  it("narrows the miro resize grammar and keeps fit vs fill", () => {
    expect(thumbnailUrl(MIRO, 400)).toBe("https://miro.medium.com/v2/resize:fit:400/1*abc.jpeg");
    expect(thumbnailUrl("https://miro.medium.com/v2/resize:fill:800:600/1*a.png", 400))
      .toBe("https://miro.medium.com/v2/resize:fill:400:600/1*a.png");
  });

  it("never upscales an image that is already smaller", () => {
    const small = "https://cdn-images-1.medium.com/max/256/1*a.png";
    expect(thumbnailUrl(small, 400)).toBe(small);
  });

  it("leaves a host with no known resize grammar untouched", () => {
    // A wrong guess is a broken image, which is worse than a heavy one.
    const other = "https://github.blog/wp-content/uploads/2026/09/hero.png";
    expect(thumbnailUrl(other, 400)).toBe(other);
  });

  it("handles absent images", () => {
    expect(thumbnailUrl(null, 400)).toBeNull();
    expect(thumbnailUrl(undefined, 400)).toBeNull();
  });

  it("is deterministic and idempotent", () => {
    const once = thumbnailUrl(CDN, 400)!;
    expect(thumbnailUrl(once, 400)).toBe(once);
  });
});
