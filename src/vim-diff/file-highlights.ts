/**
 * Highlighting a diff from the file it came out of (spec 080).
 *
 * The rows riff draws are fragments: the folds take text out, and both
 * sides of the change are interleaved. Parsing that as if it were the file
 * gets a hunk that starts inside a block comment wrong — it is read as
 * code, because the `/**` is in a part nobody is looking at.
 *
 * So the file is parsed instead, and its highlights are moved onto the rows
 * that show its lines. A row the file has no line for — a deletion, a fold
 * marker — is left to whatever the fragment parse made of it.
 */

import type { SimpleHighlight } from "@opentui/core"

/**
 * Past this, a file is not parsed for its colours (spec 080).
 *
 * A generated bundle or a lock file is where the size comes from, and it
 * is exactly the file whose colours are worth nothing: nobody reads it,
 * they look for the one line that changed. Half a megabyte is well past
 * anything hand-written.
 */
export const MAX_HIGHLIGHT_BYTES = 512 * 1024

/** Whether a file is worth parsing for the rows' colours. */
export function worthHighlighting(content: string): boolean {
  return content.length <= MAX_HIGHLIGHT_BYTES
}

/** Character offset of every line start, the first at 0. */
export function lineStarts(content: string): number[] {
  const offsets = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") offsets.push(i + 1)
  }
  return offsets
}

export interface MapOptions {
  /** Highlights over the whole file, in the file's own offsets. */
  fileHighlights: readonly SimpleHighlight[]
  fileContent: string
  /** The text handed to the renderer: the rows, joined by newlines. */
  rowsContent: string
  /** For each row, the file line it shows (1-based), or null. */
  rowLines: readonly (number | null)[]
}

/**
 * The file's highlights, in the offsets of the rows on screen.
 *
 * A highlight spanning several lines is cut at each line, since the rows
 * are not next to each other in the file and a range across them would
 * paint whatever happens to sit between.
 */
export function mapFileHighlights(options: MapOptions): SimpleHighlight[] {
  const { fileHighlights, fileContent, rowsContent, rowLines } = options
  if (fileHighlights.length === 0) return []

  const fileStarts = lineStarts(fileContent)
  const rowStarts = lineStarts(rowsContent)

  const rowOfLine = new Map<number, number>()
  rowLines.forEach((line, row) => {
    if (line !== null && !rowOfLine.has(line)) rowOfLine.set(line, row)
  })

  const mapped: SimpleHighlight[] = []
  for (const [start, end, group] of fileHighlights) {
    let line = lineAt(fileStarts, start)
    while (line < fileStarts.length && fileStarts[line]! < end) {
      const lineStart = fileStarts[line]!
      const lineEnd = (fileStarts[line + 1] ?? fileContent.length + 1) - 1
      const row = rowOfLine.get(line + 1)
      line++
      if (row === undefined) continue

      const rowStart = rowStarts[row]
      if (rowStart === undefined) continue
      const rowEnd = (rowStarts[row + 1] ?? rowsContent.length + 1) - 1

      const from = rowStart + Math.max(0, start - lineStart)
      const to = rowStart + Math.min(lineEnd - lineStart, end - lineStart)
      if (to > from) mapped.push([from, Math.min(to, rowEnd), group])
    }
  }

  return mapped
}

/** The index of the line an offset falls on. */
function lineAt(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid]! <= offset) low = mid
    else high = mid - 1
  }
  return low
}
