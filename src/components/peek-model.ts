/**
 * What each peek shows, apart from how it is drawn. The four peeks share one
 * shape: a box of a given width over a dimmed screen, a header of coloured
 * segments, a body and a footer.
 */

export type PeekTone = "primary" | "dim" | "text" | "green" | "red" | "blue" | "peach" | "yellow"

export interface PeekSegment {
  text: string
  tone: PeekTone
}

export interface PeekModel {
  id: "line-peek" | "table-peek" | "diagram-peek" | "hunk-peek" | "blame-peek"
  /** The box's outer width, padding included. */
  width: number
  /** Base when left out. */
  background?: "base" | "mantle"
  header: PeekSegment[]
  body:
    | { kind: "rows"; rows: PeekSegment[] }
    // Rows whose parts differ in colour, each row its segments side by side.
    | { kind: "lines"; lines: PeekSegment[][] }
    | { kind: "code"; content: string; filetype?: string; width: number }
  footer: string
}

export type Side = "new" | "old"
export type Scroll = { row: number; col: number }
export type Screen = { terminalWidth: number; terminalHeight: number }

/** Header, footer, padding and a row of air above and below the box. */
export const CHROME_ROWS = 6
export const MAX_WIDTH = 120
export const PADDING = 2

export const sideLabel = (side: Side): PeekSegment =>
  side === "new" ? { text: "as changed", tone: "green" } : { text: "before the change", tone: "peach" }
export const otherVersion = (side: Side) => `Tab: ${side === "new" ? "previous" : "current"} version`
export const textRows = (lines: readonly string[]): PeekModel["body"] => ({
  kind: "rows",
  rows: lines.map((text) => ({ text, tone: "text" })),
})
export const segments = (...parts: (PeekSegment | null)[]) => parts.filter((part): part is PeekSegment => part !== null)

/**
 * The part of a drawing a window of `rows` × `cols` shows from a scroll
 * position, the position clamped to the drawing — and, when it does not
 * all fit, where the window is, for the header.
 */
export function viewport(
  body: readonly string[],
  scroll: Scroll,
  rows: number,
  cols: number
): { lines: string[]; scrollable: boolean; where: string } {
  const widest = Math.max(0, ...body.map((line) => line.length))
  const row = Math.max(0, Math.min(scroll.row, Math.max(0, body.length - rows)))
  const col = Math.max(0, Math.min(scroll.col, Math.max(0, widest - cols)))
  const lines = body.slice(row, row + rows).map((line) => line.slice(col, col + cols))

  const tall = body.length > rows
  const wide = widest > cols
  const where = [
    tall ? `rows ${row + 1}–${Math.min(body.length, row + rows)} of ${body.length}` : null,
    wide ? `columns ${col + 1}–${Math.min(widest, col + cols)} of ${widest}` : null,
  ]
    .filter(Boolean)
    .join(", ")
  return { lines, scrollable: tall || wide, where }
}
