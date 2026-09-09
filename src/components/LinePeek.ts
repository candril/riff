import { Box, Text, h, CodeRenderable } from "@opentui/core"
import { colors, theme } from "../theme"
import { getSyntaxStyle } from "./VimDiffView"

export interface LinePeekProps {
  /** The full, unclipped line. */
  content: string
  /** Line number as the file numbers it, when the line has one. */
  lineNumber?: number
  /** Tree-sitter filetype, so the line reads the way it does in the diff. */
  filetype?: string
  /** Terminal size, to fit the box to the current window. */
  terminalWidth: number
  terminalHeight: number
}

const HORIZONTAL_PADDING = 2
const MAX_WIDTH = 120
const MAX_ROWS = 20
/** Header, footer, padding and a row of air above and below the box. */
const CHROME_ROWS = 6

/**
 * The whole of one line, wrapped, over the diff.
 *
 * The diff itself cannot wrap without breaking the row-per-line alignment
 * the cursor and every comment anchor rely on, so the escape hatch for a
 * line too long to scroll through comfortably is to show it somewhere the
 * alignment doesn't matter.
 */
export function LinePeek({
  content,
  lineNumber,
  filetype,
  terminalWidth,
  terminalHeight,
}: LinePeekProps) {
  const width = Math.max(20, Math.min(MAX_WIDTH, terminalWidth - 8))
  const columns = width - HORIZONTAL_PADDING * 2
  const label = lineNumber !== undefined ? `line ${lineNumber}` : "line"

  // A minified bundle would wrap into more rows than the terminal has, and
  // the box grows with its content — so the line is cut to what fits. The
  // estimate is loose on purpose: word wrapping fits fewer columns per row
  // than this assumes, and cutting a little late beats cutting text that
  // would have fitted.
  const rows = Math.max(1, Math.min(MAX_ROWS, terminalHeight - CHROME_ROWS))
  const capacity = columns * rows
  const shown = content.length > capacity ? `${content.slice(0, capacity - 1)}…` : content

  return Box(
    {
      id: "line-peek",
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
        paddingLeft: HORIZONTAL_PADDING,
        paddingRight: HORIZONTAL_PADDING,
        width,
      },
      Box(
        { height: 1, marginBottom: 1, flexDirection: "row", gap: 1 },
        Text({ content: label, fg: colors.primary }),
        Text({ content: `${content.length} cols`, fg: colors.textDim })
      ),
      // Highlighted rather than plain, because the point of reading the
      // line here is to read it as code. Wrapped on words — most long
      // lines worth peeking at are prose, and a token with no break in it
      // still gets broken at the edge.
      h(CodeRenderable, {
        id: "line-peek-code",
        content: shown,
        filetype,
        syntaxStyle: getSyntaxStyle(),
        drawUnstyledText: true,
        conceal: false,
        wrapMode: "word",
        width: columns,
      }),
      Box(
        { height: 1, marginTop: 1 },
        Text({ content: "Press gl or Esc to close", fg: colors.textDim })
      )
    )
  )
}
