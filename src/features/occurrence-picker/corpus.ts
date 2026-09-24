/**
 * The rows the occurrence picker searches (spec 088): every addition,
 * deletion and context row of every hunk in the change set, numbered the way
 * the line mapping numbers them so a hit can be found again on screen.
 */

import type { DiffFile } from "../../utils/diff-parser"

export interface OccurrenceRow {
  fileIndex: number
  filename: string
  kind: "addition" | "deletion" | "context"
  /** New-side line number, or old-side for a deletion. */
  lineNum: number
  side: "LEFT" | "RIGHT"
  /** The row's text without its diff marker. */
  text: string
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function buildOccurrenceRows(files: readonly DiffFile[]): OccurrenceRow[] {
  const rows: OccurrenceRow[] = []

  files.forEach((file, fileIndex) => {
    let oldLine = 0
    let newLine = 0
    // Everything before the first `@@` is header; after it, a line that
    // reads like `--- a/x` is a deleted `-- a/x`, not a header.
    let inHunk = false

    for (const raw of file.content.split("\n")) {
      const hunk = raw.match(HUNK_HEADER)
      if (hunk) {
        oldLine = parseInt(hunk[1]!, 10)
        newLine = parseInt(hunk[2]!, 10)
        inHunk = true
        continue
      }
      if (!inHunk) continue

      const base = { fileIndex, filename: file.filename, text: raw.slice(1) }
      switch (raw[0]) {
        case "+":
          rows.push({ ...base, kind: "addition", lineNum: newLine++, side: "RIGHT" })
          break
        case "-":
          rows.push({ ...base, kind: "deletion", lineNum: oldLine++, side: "LEFT" })
          break
        case " ":
          rows.push({ ...base, kind: "context", lineNum: newLine, side: "RIGHT" })
          oldLine++
          newLine++
          break
      }
    }
  })

  return rows
}
