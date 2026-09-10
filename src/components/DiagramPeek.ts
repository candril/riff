import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"

export interface DiagramPeekProps {
  /** The drawing, one string per row. Empty falls back to `source`. */
  lines: string[]
  /** The mermaid source, shown when there is nothing to draw. */
  source: string[]
  kind: "flowchart" | "sequence" | "unsupported"
  /** Which version of the block is on show. */
  side: "new" | "old"
  /** Whether Tab has another version to switch to. */
  hasOther: boolean
  note?: string
  /** Where the window onto the drawing sits; clamped to the drawing here. */
  scroll: { row: number; col: number }
  terminalWidth: number
  terminalHeight: number
}

/** Header, footer, padding and a row of air above and below the box. */
const CHROME_ROWS = 6

/**
 * The part of a drawing a window of `rows` × `cols` shows from a scroll
 * position, the position clamped to the drawing — and, when it does not
 * all fit, where the window is, for the header.
 */
export function viewport(
  body: readonly string[],
  scroll: { row: number; col: number },
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

/**
 * The mermaid block under the cursor, drawn.
 *
 * The diff can only ever show the source, because that is the only thing a
 * comment can anchor to. Whether the diagram it describes is right is a
 * different question, and this is where it gets answered.
 */
export function DiagramPeek({
  lines,
  source,
  kind,
  side,
  hasOther,
  note,
  scroll,
  terminalWidth,
  terminalHeight,
}: DiagramPeekProps) {
  const drawn = lines.length > 0
  const body = drawn ? lines : source
  const room = Math.max(3, terminalHeight - CHROME_ROWS)
  const columns = Math.max(20, terminalWidth - 8)

  // A window onto the drawing, not a clip of it: what does not fit is a
  // scroll away rather than gone (hjkl, like the diff).
  const view = viewport(body, scroll, room, columns)
  const shown = view.lines
  const width = Math.max(...shown.map((line) => line.length), 24)

  const footer = [
    hasOther ? `Tab: ${side === "new" ? "previous" : "current"} version` : null,
    view.scrollable ? "hjkl to scroll" : null,
    "gl or Esc to close",
  ]
    .filter(Boolean)
    .join(" · ")
  const cut = view.where

  return Box(
    {
      id: "diagram-peek",
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
    },
    Box({
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "#00000080",
    }),
    Box(
      {
        flexDirection: "column",
        backgroundColor: theme.base,
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 2,
        paddingRight: 2,
        width: width + 4,
      },
      Box(
        { height: 1, marginBottom: 1, flexDirection: "row", gap: 1 },
        Text({ content: kind === "sequence" ? "sequence" : "mermaid", fg: colors.primary }),
        Text({
          content: side === "new" ? "as changed" : "before the change",
          fg: side === "new" ? theme.green : theme.peach,
        }),
        note ? Text({ content: `· ${note}`, fg: colors.textDim }) : null,
        cut ? Text({ content: `· ${cut}`, fg: theme.yellow }) : null,
        drawn ? null : Text({ content: "· source", fg: colors.textDim })
      ),
      // Pre-rendered, so each row is one Text of its own: an absolutely
      // positioned box sizes itself as if every child were a single row.
      ...shown.map((line) => Box({ height: 1 }, Text({ content: line, fg: colors.text }))),
      Box({ height: 1, marginTop: 1 }, Text({ content: footer, fg: colors.textDim }))
    )
  )
}
