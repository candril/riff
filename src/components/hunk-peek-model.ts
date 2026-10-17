import { CHROME_ROWS, MAX_WIDTH, PADDING, segments, type PeekModel, type PeekTone, type Screen } from "./peek-model"

export interface HunkPeekInput extends Screen {
  /** The stored diff hunk, `@@` header and all. */
  hunk: string
  filename: string
  line: number
  /** Whether the thread this belongs to has drifted off the head. */
  outdated: boolean
  /** True when a reply borrowed the hunk from the thread's root. */
  fromRoot: boolean
}

function hunkTone(row: string): PeekTone {
  if (row.startsWith("+")) return "green"
  if (row.startsWith("-")) return "red"
  if (row.startsWith("@@")) return "blue"
  return "text"
}

/**
 * The code a comment was written against. For an outdated thread this is the
 * only copy of that code riff has: the diff shows the file as it is now.
 */
export function hunkPeekModel({ hunk, filename, line, outdated, fromRoot, terminalWidth, terminalHeight }: HunkPeekInput): PeekModel {
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
  const fromRootNote = " · from the thread's first comment"
  const headerLength = `${where} ${label}${fromRoot ? fromRootNote : ""}`.length
  return {
    id: "hunk-peek",
    width: Math.min(columns, Math.max(...shown.map((row) => row.length), headerLength, 32)) + PADDING * 2,
    header: segments(
      { text: where, tone: "primary" },
      { text: label, tone: outdated ? "peach" : "dim" },
      fromRoot ? { text: fromRootNote.trimStart(), tone: "dim" } : null
    ),
    body: { kind: "rows", rows: shown.map((row) => ({ text: row || " ", tone: hunkTone(row) })) },
    footer: "c or Esc to close",
  }
}
