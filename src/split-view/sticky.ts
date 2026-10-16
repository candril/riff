/**
 * The file header to pin over the view's first row: the last one whose own
 * row has scrolled above it. None while a header is the top row itself, so
 * a file's header is never covered by the previous file's name, nor a
 * collapsed file pinned over the header that follows it. `headerLines` is
 * sorted, so the search halves it.
 */
export function stickyHeaderLine(
  headerLines: readonly number[],
  firstOf: (row: number) => number,
  scrollTop: number
): number | undefined {
  let low = 0
  let high = headerLines.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (firstOf(headerLines[mid]!) <= scrollTop) low = mid + 1
    else high = mid
  }
  if (low === 0) return undefined
  const line = headerLines[low - 1]!
  return firstOf(line) === scrollTop ? undefined : line
}
