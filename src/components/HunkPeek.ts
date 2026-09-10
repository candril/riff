import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"

export interface HunkPeekProps {
  /** The stored diff hunk, `@@` header and all. */
  hunk: string
  filename: string
  line: number
  /** Whether the thread this belongs to has drifted off the head. */
  outdated: boolean
  /** True when a reply borrowed the hunk from the thread's root. */
  fromRoot: boolean
  terminalWidth: number
  terminalHeight: number
}

/** Header, footer, padding and a row of air above and below the box. */
const CHROME_ROWS = 6
const MAX_WIDTH = 120

/**
 * The code a comment was written against, over the comments panel.
 *
 * For an outdated thread this is the only copy of that code riff has: the
 * diff shows the file as it is now, and what the comment objected to is not
 * in it any more.
 */
export function HunkPeek({
  hunk,
  filename,
  line,
  outdated,
  fromRoot,
  terminalWidth,
  terminalHeight,
}: HunkPeekProps) {
  const columns = Math.max(24, Math.min(MAX_WIDTH, terminalWidth - 8))
  const room = Math.max(3, terminalHeight - CHROME_ROWS)

  const all = hunk.replace(/\n+$/, "").split("\n")
  // The end of a hunk is the part the comment is about; GitHub anchors the
  // comment to its last line.
  const rows = all.length > room ? ["…", ...all.slice(all.length - room + 1)] : all
  const shown = rows.map((row) => (row.length > columns ? `${row.slice(0, columns - 1)}…` : row))

  // The file's own name is enough — the panel is already scoped to it, and a
  // long path would push the code off the edge of the box.
  const where = `${filename.split("/").pop() ?? filename}:${line}`
  const label = outdated ? "as it was when this was written" : "the code this was written against"
  const header = `${where} ${label}${fromRoot ? " · from the thread's first comment" : ""}`
  const width = Math.min(columns, Math.max(...shown.map((row) => row.length), header.length, 32))

  return Box(
    {
      id: "hunk-peek",
      position: "absolute",
      // Above the comments panel (50), which is what this is drawn over.
      zIndex: 60,
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
        Text({ content: where, fg: colors.primary }),
        Text({ content: label, fg: outdated ? theme.peach : colors.textDim }),
        fromRoot ? Text({ content: "· from the thread's first comment", fg: colors.textDim }) : null
      ),
      ...shown.map((row) => Box({ height: 1 }, Text({ content: row || " ", fg: hunkColor(row) }))),
      Box({ height: 1, marginTop: 1 }, Text({ content: "c or Esc to close", fg: colors.textDim }))
    )
  )
}

function hunkColor(row: string): string {
  if (row.startsWith("+")) return theme.green
  if (row.startsWith("-")) return theme.red
  if (row.startsWith("@@")) return theme.blue
  return colors.text
}
