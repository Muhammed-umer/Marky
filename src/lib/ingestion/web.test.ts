import { describe, expect, it } from "vitest";
import { parseWebMetadata } from "@/lib/ingestion/web-metadata";

describe("parseWebMetadata", () => {
  it("extracts dashboard fields and respects a canonical URL", () => {
    const metadata = parseWebMetadata(`<!doctype html><html><head>
      <title>Fallback title</title>
      <link rel="canonical" href="/article?utm_source=test" />
      <meta property="og:title" content="A useful engineering article" />
      <meta name="author" content="Jane Developer" />
      <meta name="description" content="A practical explanation of reliable APIs." />
      <meta property="article:published_time" content="2026-09-01T10:00:00Z" />
    </head><body><article><p>Article body.</p></article></body></html>`, "https://example.com/shared");
    expect(metadata).toEqual({
      canonicalUrl: "https://example.com/article",
      title: "A useful engineering article",
      author: "Jane Developer",
      summary: "A practical explanation of reliable APIs.",
      publishedAt: "2026-09-01T10:00:00.000Z",
    });
  });
});
