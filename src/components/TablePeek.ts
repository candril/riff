import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"

export interface TablePeekProps {
  /** The rendered table, one string per terminal row. */
  lines: string[]
  /** How many source rows the table has, for the header. */
  rowCount: number
  terminalHeight: number
}

const MAX_ROWS = 30

/**
 * The table under the cursor, drawn as a grid.
 *
 * The diff shows a table as its source, which is the only thing a comment
 * can anchor to — but the source of a table with prose in it is
 * unreadable. This is where you check that it reads right; the diff next
 * to it is where you say so.
 */
export function TablePeek({ lines, rowCount, terminalHeight }: TablePeekProps) {
  const room = Math.max(3, Math.min(MAX_ROWS, terminalHeight - 6))
  const shown = lines.length > room ? [...lines.slice(0, room - 1), "…"] : lines
  const width = Math.max(...shown.map((line) => line.length), 20)

  return Box(
    {
      id: "table-peek",
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
        Text({ content: "table", fg: colors.primary }),
        Text({ content: `${rowCount} rows`, fg: colors.textDim })
      ),
      // Pre-rendered, so each row is one Text of its own: an absolutely
      // positioned box sizes itself as if every child were a single row.
      ...shown.map((line) => Box({ height: 1 }, Text({ content: line, fg: colors.text }))),
      Box(
        { height: 1, marginTop: 1 },
        Text({ content: "Press gl or Esc to close", fg: colors.textDim })
      )
    )
  )
}
