/** Complete report reads: callers must order by a unique key before range(). */
export const REPORT_PAGE_SIZE = 500;
export const REPORT_ID_CHUNK_SIZE = 50;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function readAllReportPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await fetchPage(rows.length, rows.length + REPORT_PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    rows.push(...data);
    // Continue even after a short page: the service may apply a smaller cap.
  }
}

export async function readReportIdChunks<T>(
  ids: readonly string[],
  fetchPage: (ids: string[], from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let start = 0; start < unique.length; start += REPORT_ID_CHUNK_SIZE) {
    const chunk = unique.slice(start, start + REPORT_ID_CHUNK_SIZE);
    rows.push(...await readAllReportPages((from, to) => fetchPage(chunk, from, to)));
  }
  return rows;
}