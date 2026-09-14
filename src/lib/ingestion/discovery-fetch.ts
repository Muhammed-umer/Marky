import "server-only";
import { assertPublicHttpUrl, MARKY_USER_AGENT } from "@/lib/ingestion/network";

/**
 * The one outbound request every discovery adapter makes.
 *
 * Every URL still goes through assertPublicHttpUrl even though these endpoints
 * are hard-coded constants: the query string is built from database
 * configuration, and the rule in this codebase is that no fetch of a URL
 * assembled from stored input bypasses the SSRF guard. Redirects are handled
 * by hand for the same reason -- a redirect is a new URL nobody has checked --
 * so each hop is re-checked and must stay on the host that was asked.
 *
 * Same-host redirects are followed because GitHub answers 301 for a renamed
 * repository (`repos/facebook/react` now redirects to `repositories/10270250`)
 * and the source would otherwise fail every run with HTTP_301, as the React
 * releases source did on 2026-09-14.
 */

const FETCH_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export interface DiscoveryFetchOptions {
  accept: string;
  /** Extra headers a platform requires, such as a GitHub API version. */
  headers?: Record<string, string>;
}

async function fetchText(url: string, options: DiscoveryFetchOptions): Promise<string> {
  let safeUrl = await assertPublicHttpUrl(url);
  const host = safeUrl.hostname;
  for (let hop = 0; ; hop += 1) {
    const response = await fetch(safeUrl, {
      headers: { Accept: options.accept, "User-Agent": MARKY_USER_AGENT, ...options.headers },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || hop >= MAX_REDIRECTS) throw new Error(`HTTP_${response.status}`);
      const next = await assertPublicHttpUrl(new URL(location, safeUrl).toString());
      // A platform API sending us to another host is not a redirect to follow.
      if (next.hostname !== host) throw new Error("REDIRECT_OFF_HOST");
      safeUrl = next;
      continue;
    }
    // 403 with a zero remaining budget is how GitHub reports a spent rate limit,
    // and it is worth telling apart from a genuine refusal in sources.last_error.
    if (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0") {
      throw new Error("RATE_LIMITED");
    }
    if (response.status === 429) throw new Error("RATE_LIMITED");
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
    return body;
  }
}

export async function fetchDiscoveryJson<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const body = await fetchText(url, { accept: "application/json", headers });
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error("MALFORMED_JSON");
  }
}

export async function fetchDiscoveryXml(url: string): Promise<string> {
  return fetchText(url, { accept: "application/atom+xml, application/xml, text/xml;q=0.9" });
}
