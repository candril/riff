import {
  CHROME_ROWS,
  PADDING,
  otherVersion,
  segments,
  sideLabel,
  textRows,
  viewport,
  type PeekModel,
  type Screen,
  type Scroll,
  type Side,
} from "./peek-model"

export interface TablePeekInput extends Screen {
  /** The rendered table, one string per terminal row. */
  lines: string[]
  /** How many source rows the table has, for the header. */
  rowCount: number
  /** Which version of a changed table is on show. */
  side: Side
  /** Whether Tab has another version to switch to. */
  hasOther: boolean
  /** Where the window onto the table sits; clamped to the table here. */
  scroll: Scroll
}

/**
 * The table under the cursor, as a grid. The diff shows a table as its
 * source, the only thing a comment can anchor to, and the source of a table
 * with prose in it is unreadable: this is where you check that it reads right.
 */
export function tablePeekModel({ lines, rowCount, side, hasOther, scroll, terminalWidth, terminalHeight }: TablePeekInput): PeekModel {
  const room = Math.max(3, Math.min(30, terminalHeight - CHROME_ROWS))
  const view = viewport(lines, scroll, room, Math.max(20, terminalWidth - 8))
  return {
    id: "table-peek",
    width: Math.max(...view.lines.map((line) => line.length), 20) + PADDING * 2,
    header: segments(
      { text: "table", tone: "primary" },
      hasOther ? sideLabel(side) : null,
      { text: `${rowCount} rows`, tone: "dim" },
      view.where ? { text: `· ${view.where}`, tone: "yellow" } : null
    ),
    body: textRows(view.lines),
    footer: hasOther ? `${otherVersion(side)} · gl or Esc to close` : "Press gl or Esc to close",
  }
}
