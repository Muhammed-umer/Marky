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
      bodyText: "Article body.",
      imageUrl: null,
      publishedAt: "2026-09-01T10:00:00.000Z",
    });
  });

  it("reads an Open Graph image from any publisher, not only Medium", () => {
    const metadata = parseWebMetadata(`<!doctype html><html><head>
      <meta property="og:image" content="/images/hero.png" />
    </head><body><article><p>Body.</p></article></body></html>`, "https://blog.example.com/post");
    expect(metadata.imageUrl).toBe("https://blog.example.com/images/hero.png");
  });

  it("falls back to JSON-LD for the image, author and date", () => {
    const metadata = parseWebMetadata(`<!doctype html><html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "WebSite", name: "Example" },
          {
            "@type": "BlogPosting",
            headline: "Structured data post",
            image: [{ "@type": "ImageObject", url: "https://cdn.example.com/cover.jpg" }],
            author: { "@type": "Person", name: "Ada Lovelace" },
            datePublished: "2026-09-02T08:30:00Z",
          },
        ],
      })}</script>
    </head><body><article><p>Body.</p></article></body></html>`, "https://example.com/post");
    expect(metadata.imageUrl).toBe("https://cdn.example.com/cover.jpg");
    expect(metadata.author).toBe("Ada Lovelace");
    expect(metadata.publishedAt).toBe("2026-09-02T08:30:00.000Z");
  });

  it("ignores malformed JSON-LD and unsafe image hosts", () => {
    const metadata = parseWebMetadata(`<!doctype html><html><head>
      <script type="application/ld+json">{ not json </script>
      <meta property="og:image" content="http://127.0.0.1/private.png" />
    </head><body><article><p>Body.</p></article></body></html>`, "https://example.com/post");
    expect(metadata.imageUrl).toBeNull();
    expect(metadata.author).toBeNull();
  });
});
