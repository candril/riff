import { formatDiffLine } from "./hunks"

export interface ExcerptLine {
  kind: "added" | "removed" | "context"
  text: string
  oldLine?: number
  newLine?: number
}

export interface Position {
  path: string
  // Absent on a file header: the reviewer is on the file, not on a line of it.
  side?: "old" | "new"
  line?: number
  hunkHeader?: string
  excerpt: ExcerptLine[]
  cursorIndex?: number
  label: string
  // Line numbers on `side`, inclusive; the cursor sits at one end of the range.
  selection?: { start: number; end: number }
}

const formatLine = (line: ExcerptLine, atCursor: boolean) =>
  `${atCursor ? ">" : " "}${formatDiffLine(line)}`

export function formatForAgent(position: Position): string {
  const where = position.side ? `${position.label} (${position.side} side)` : position.label
  const lines = [`[Reviewer's position: ${where}]`]
  if (position.selection) {
    const { start, end } = position.selection
    lines.push(`Selected: ${position.path}:${start === end ? start : `${start}-${end}`}`)
  }
  if (position.hunkHeader) {
    lines.push(position.hunkHeader)
  }
  position.excerpt.forEach((line, i) => lines.push(formatLine(line, i === position.cursorIndex)))
  return lines.join("\n")
}
