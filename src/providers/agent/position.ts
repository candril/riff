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

const number = (n?: number) => (n === undefined ? "" : String(n)).padStart(5)

function formatLine(line: ExcerptLine, atCursor: boolean): string {
  const sign = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " "
  return `${atCursor ? ">" : " "}${number(line.oldLine)} ${number(line.newLine)} ${sign}${line.text}`
}

export function formatForAgent(position: Position): string {
  const where = position.side ? `${position.label} (${position.side} side)` : position.label
  const lines = [`[Reviewer's position: ${where}]`]
  if (position.selection) {
    const { start, end } = position.selection
    lines.push(`Selected: ${position.path}:${start}-${end}`)
  }
  if (position.hunkHeader) {
    lines.push(position.hunkHeader)
  }
  position.excerpt.forEach((line, i) => lines.push(formatLine(line, i === position.cursorIndex)))
  return lines.join("\n")
}
