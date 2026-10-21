/** Ctrl-d / Ctrl-u's step: half the rows on screen, as the diff takes it, and never nothing. */
export function halfPage(viewportRows: number): number {
  return Math.max(1, Math.floor(viewportRows / 2))
}
