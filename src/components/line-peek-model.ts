import { CHROME_ROWS, MAX_WIDTH, PADDING, type PeekModel, type Screen } from "./peek-model"

export interface LinePeekInput extends Screen {
  /** The full, unclipped line. */
  content: string
  /** Line number as the file numbers it, when the line has one. */
  lineNumber?: number
  /** Tree-sitter filetype, so the line reads the way it does in the diff. */
  filetype?: string
}

/**
 * The whole of one line, wrapped. The diff cannot wrap without breaking the
 * row-per-line alignment the cursor and every comment anchor rely on, so a
 * line too long to scroll through comfortably is shown where alignment
 * doesn't matter.
 */
export function linePeekModel({ content, lineNumber, filetype, terminalWidth, terminalHeight }: LinePeekInput): PeekModel {
  const width = Math.max(20, Math.min(MAX_WIDTH, terminalWidth - 8))
  const columns = width - PADDING * 2

  // A minified bundle would wrap into more rows than the terminal has, and
  // the box grows with its content — so the line is cut to what fits. The
  // estimate is loose on purpose: word wrapping fits fewer columns per row
  // than this assumes, and cutting a little late beats cutting text that
  // would have fitted.
  const rows = Math.max(1, Math.min(20, terminalHeight - CHROME_ROWS))
  const capacity = columns * rows
  const shown = content.length > capacity ? `${content.slice(0, capacity - 1)}…` : content

  return {
    id: "line-peek",
    width,
    header: [
      { text: lineNumber !== undefined ? `line ${lineNumber}` : "line", tone: "primary" },
      { text: `${content.length} cols`, tone: "dim" },
    ],
    // Left out rather than undefined, so reconcile sees the same keys every pass.
    body: filetype !== undefined
      ? { kind: "code", content: shown, filetype, width: columns }
      : { kind: "code", content: shown, width: columns },
    footer: "Press gl or Esc to close",
  }
}
