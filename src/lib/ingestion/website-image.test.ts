import { describe, expect, it } from "vitest";
import { engagementCountFromHtml, imageUrlFromHtml } from "@/lib/ingestion/medium";

describe("imageUrlFromHtml", () => {
  it("reads trusted article images from website metadata", () => {
    const image = imageUrlFromHtml(`
      <html><head>
        <meta property="og:image" content="https://miro.medium.com/v2/resize:fit:1200/1-site.jpg" />
      </head></html>
    `);

    expect(image).toBe("https://miro.medium.com/v2/resize:fit:1200/1-site.jpg");
  });

  it("rejects non-Medium image hosts", () => {
    const image = imageUrlFromHtml(`
      <html><head>
        <meta name="twitter:image" content="https://example.com/image.jpg" />
      </head></html>
    `);

    expect(image).toBeNull();
  });
});

describe("engagementCountFromHtml", () => {
  it("reads the largest public clap count embedded in article data", () => {
    expect(engagementCountFromHtml('<script>{"clapCount":42,"totalClapCount":1280}</script>')).toBe(1280);
  });

  it("returns zero when Medium does not expose engagement", () => {
    expect(engagementCountFromHtml("<html><body>No public count</body></html>")).toBe(0);
  });
});
