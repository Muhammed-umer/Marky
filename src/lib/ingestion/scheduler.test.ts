import { describe, expect, it } from "vitest";
import { runWithConcurrency } from "@/lib/ingestion/scheduler";

describe("runWithConcurrency", () => {
  it("preserves source order while bounding concurrent work", async () => {
    let active = 0;
    let peak = 0;
    const results = await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10]);
    expect(peak).toBe(2);
  });
});
