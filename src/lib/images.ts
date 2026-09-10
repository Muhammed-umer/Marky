/**
 * Asks a publisher's CDN for an image the size we actually display.
 *
 * Feed cards render into a 180x120 slot, but the stored URL is whatever the
 * publisher put in their feed -- often the full-resolution original. Measured
 * on 2026-09-10 across ten real feed images: 14.7 MB total, with single images
 * at 1.8, 2.2 and 3.6 MB, every one of them painted into a thumbnail. Narrowing
 * the request took the same ten to 2.5 MB, an 83% saving.
 *
 * This rewrites the width inside URLs the CDN already understands. It does not
 * introduce a new host, proxy anything, or touch Next.js image optimisation --
 * which stays off because publisher hosts are unbounded and allow-listing them
 * would break every new source.
 *
 * It only ever narrows. A URL already asking for less than we need is left
 * alone, so this can make a request smaller but never larger or blurrier than
 * the publisher intended.
 */

interface Rewrite {
  /** Captures the current width so it can be compared before narrowing. */
  pattern: RegExp;
  replace: (url: string, width: number) => string;
}

const REWRITES: Rewrite[] = [
  {
    // https://cdn-images-1.medium.com/max/1200/1*abc.png
    pattern: /\/max\/(\d+)\//,
    replace: (url, width) => url.replace(/\/max\/\d+\//, `/max/${width}/`),
  },
  {
    // https://miro.medium.com/v2/resize:fit:1200/1*abc.png
    pattern: /resize:(?:fit|fill):(\d+)/,
    replace: (url, width) => url.replace(/resize:(fit|fill):\d+/, `resize:$1:${width}`),
  },
];

/**
 * @param width the widest the image will be painted, in CSS pixels. Pass the
 *   slot size; the caller decides whether to double it for dense displays.
 */
export function thumbnailUrl(url: string | null | undefined, width: number): string | null {
  if (!url) return null;
  const target = Math.max(1, Math.round(width));

  for (const { pattern, replace } of REWRITES) {
    const match = url.match(pattern);
    if (!match) continue;
    const current = Number(match[1]);
    // Never upscale: a smaller original stays as it is.
    if (Number.isFinite(current) && current <= target) return url;
    return replace(url, target);
  }

  // A host with no known resize grammar is returned untouched rather than
  // guessed at -- a wrong guess is a broken image, which is worse than a
  // heavy one.
  return url;
}
