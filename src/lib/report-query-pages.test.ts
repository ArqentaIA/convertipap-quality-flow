import { describe, expect, it } from "vitest";
import { readAllReportPages, readReportIdChunks } from "./report-query-pages";

describe("complete report reads", () => {
  it("reads beyond 1000 rows even when the service returns short pages", async () => {
    const source = Array.from({ length: 2347 }, (_, id) => ({ id }));
    const rows = await readAllReportPages(async (from, to) => ({
      data: source.slice(from, Math.min(to + 1, from + 137)), error: null,
    }));
    expect(rows).toEqual(source);
    expect(new Set(rows.map(r => r.id)).size).toBe(source.length);
  });
  it("splits and deduplicates identifiers and returns the full combined result", async () => {
    const ids = Array.from({ length: 449 }, (_, i) => String(i));
    const seen: number[] = [];
    const rows = await readReportIdChunks([...ids, ids[0]], async (chunk, from, to) => {
      seen.push(chunk.length);
      const source = chunk.flatMap(id => Array.from({ length: 31 }, (_, i) => `${id}:${i}`));
      return { data: source.slice(from, to + 1), error: null };
    });
    expect(Math.max(...seen)).toBeLessThanOrEqual(50);
    expect(rows.length).toBe(449 * 31);
    expect(new Set(rows).size).toBe(rows.length);
  });
  it("does not deliver partial data if a later page fails", async () => {
    await expect(readAllReportPages(async from => from === 0
      ? { data: [1, 2], error: null }
      : { data: null, error: { message: "Unavailable" } })).rejects.toThrow("Unavailable");
  });
  it("does not query an empty identifier list", async () => {
    let calls = 0;
    expect(await readReportIdChunks([], async () => { calls++; return { data: [], error: null }; })).toEqual([]);
    expect(calls).toBe(0);
  });
});