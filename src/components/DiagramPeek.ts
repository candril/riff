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
  terminalWidth: number
  terminalHeight: number
}

/** Header, footer, padding and a row of air above and below the box. */
const CHROME_ROWS = 6

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
  terminalWidth,
  terminalHeight,
}: DiagramPeekProps) {
  const drawn = lines.length > 0
  const body = drawn ? lines : source
  const room = Math.max(3, terminalHeight - CHROME_ROWS)
  const columns = Math.max(20, terminalWidth - 8)

  const clipped = body.length > room ? [...body.slice(0, room - 1), "…"] : body
  const shown = clipped.map((line) => (line.length > columns ? `${line.slice(0, columns - 1)}…` : line))
  const width = Math.max(...shown.map((line) => line.length), 24)

  const wide = body.some((line) => line.length > columns)
  const tall = body.length > room
  const cut = [wide ? "cut off at the edge" : null, tall ? "too tall for the window" : null]
    .filter(Boolean)
    .join(", ")

  const footer = [
    hasOther ? `Tab: ${side === "new" ? "previous" : "current"} version` : null,
    "gl or Esc to close",
  ]
    .filter(Boolean)
    .join(" · ")

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
