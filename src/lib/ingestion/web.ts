import "server-only";
import { assertPublicHttpUrl } from "@/lib/ingestion/network";
import { parseWebMetadata, type WebMetadata } from "@/lib/ingestion/web-metadata";

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export async function fetchWebMetadata(value: string): Promise<WebMetadata> {
  let url = await assertPublicHttpUrl(value);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/xhtml+xml;q=0.9" },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("TOO_MANY_REDIRECTS");
      url = await assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) throw new Error("UNEXPECTED_CONTENT_TYPE");
    if (Number(response.headers.get("content-length") ?? 0) > MAX_PAGE_BYTES) throw new Error("PAGE_TOO_LARGE");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) throw new Error("PAGE_TOO_LARGE");
    return parseWebMetadata(html, url.toString());
  }
  throw new Error("TOO_MANY_REDIRECTS");
}

export type { WebMetadata } from "@/lib/ingestion/web-metadata";
