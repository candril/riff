/**
 * Line up the columns of a markdown table in the diff.
 *
 * A table diff is unreadable in two different ways. Unaligned source is
 * a wall of pipes with no columns to scan, and you cannot see which cell
 * changed. Hand-aligned source is worse: one character in one cell reflows
 * every row's padding, so the diff marks the whole table changed and the
 * real edit drowns.
 *
 * Padding the cells at display time answers both. Nothing here changes how
 * many lines there are, so line numbers, hunks, folds and comment anchors
 * are untouched — and a `-` row lines up cell-for-cell with the `+` row
 * that replaced it, which is what makes the change visible at all.
 *
 * The original text is kept (`sourceContent` on the mapping line) so `y`
 * still yanks what is in the file.
 */

const MARKDOWN_FILE = /\.(md|markdown|mdx)$/i
const FENCE = /^(```|~~~)/
const DELIMITER_CELL = /^:?-+:?$/

/** A delimiter cell needs three dashes to still parse as one. */
const MIN_DELIMITER_WIDTH = 3

export type CellAlignment = "left" | "right" | "center" | "default"

/** The subset of a diff line this needs; keeps the module free of the mapping. */
export interface AlignableLine {
  type: string
  content: string
  filename?: string
}

/** A line whose displayed text should change, by index into the input. */
export interface AlignedRow {
  index: number
  content: string
}

/** Line types that carry file content — the ones a table can be made of. */
const CONTENT_TYPES = new Set(["addition", "deletion", "context"])

/**
 * Find every table in the given lines and return the rows to repaint.
 * Lines that are already aligned produce no entry.
 */
export function alignMarkdownTables(lines: readonly AlignableLine[]): AlignedRow[] {
  return tableBlocks(lines).flatMap((block) => alignBlock(lines, block))
}

/**
 * Every run of table rows in the given lines, as indices into them. A run
 * is two or more consecutive rows: one line starting with a pipe is more
 * likely prose than a table.
 */
export function tableBlocks(lines: readonly AlignableLine[]): number[][] {
  const blocks: number[][] = []
  const fenced = fencedLines(lines)

  let block: number[] = []
  const flush = (): void => {
    if (block.length >= 2) blocks.push(block)
    block = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const continues =
      MARKDOWN_FILE.test(line.filename ?? "") &&
      CONTENT_TYPES.has(line.type) &&
      !fenced.has(i) &&
      line.content.trim().startsWith("|") &&
      (block.length === 0 || lines[block[0]!]!.filename === line.filename)

    if (continues) {
      block.push(i)
    } else {
      flush()
    }
  }
  flush()

  return blocks
}

/** The table around a line, or null when the line is not in one. */
export function findTableBlock(
  lines: readonly AlignableLine[],
  index: number
): number[] | null {
  return tableBlocks(lines).find((block) => block.includes(index)) ?? null
}

/**
 * Rows inside a fenced code block, which are documentation of a table
 * rather than a table — this repo's own CLAUDE.md has such a fence.
 *
 * Only the new side is followed: a deleted fence marker never opened the
 * block the following lines live in. A hunk that starts inside a fence
 * cannot be detected at all, which is the accepted limit here.
 */
function fencedLines(lines: readonly AlignableLine[]): Set<number> {
  const fenced = new Set<number>()
  const open = new Map<string, boolean>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (line.type === "deletion" || !CONTENT_TYPES.has(line.type)) continue

    const file = line.filename ?? ""
    if (FENCE.test(line.content.trim())) {
      open.set(file, !(open.get(file) ?? false))
      continue
    }
    if (open.get(file)) fenced.add(i)
  }

  return fenced
}

/** Pad one run of table rows onto a shared grid. */
function alignBlock(lines: readonly AlignableLine[], block: readonly number[]): AlignedRow[] {
  const rows = block.map((index) => ({ index, ...splitRow(lines[index]!.content) }))

  const columns = Math.max(...rows.map((row) => row.cells.length))
  const alignments = columnAlignments(rows, columns)

  // A hunk often shows a table without its delimiter row; the columns are
  // still worth lining up, they just have no minimum to respect.
  const hasDelimiter = rows.some((row) => isDelimiterRow(row.cells))
  const widths: number[] = []
  for (let column = 0; column < columns; column++) {
    let width = hasDelimiter ? MIN_DELIMITER_WIDTH : 1
    for (const row of rows) {
      if (isDelimiterRow(row.cells)) continue
      width = Math.max(width, displayWidth(row.cells[column] ?? ""))
    }
    widths[column] = width
  }

  const changes: AlignedRow[] = []
  for (const row of rows) {
    const cells = isDelimiterRow(row.cells)
      ? widths.map((width, column) => delimiterCell(width, alignments[column]!))
      : widths.map((width, column) => pad(row.cells[column] ?? "", width, alignments[column]!))

    const content = `${row.indent}| ${cells.join(" | ")} |`
    if (content !== lines[row.index]!.content) {
      changes.push({ index: row.index, content })
    }
  }

  return changes
}

function columnAlignments(
  rows: readonly { cells: string[] }[],
  columns: number
): CellAlignment[] {
  const delimiter = rows.find((row) => isDelimiterRow(row.cells))
  const alignments: CellAlignment[] = []

  for (let column = 0; column < columns; column++) {
    const cell = delimiter?.cells[column]
    if (!cell) {
      alignments[column] = "default"
      continue
    }
    const left = cell.startsWith(":")
    const right = cell.endsWith(":")
    alignments[column] = left && right ? "center" : right ? "right" : left ? "left" : "default"
  }

  return alignments
}

export function isDelimiterRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => DELIMITER_CELL.test(cell))
}

/**
 * Split a row into trimmed cells. Pipes split a cell even inside a code
 * span — GFM only exempts `\|` — so the escape is the single special case.
 */
export function splitRow(row: string): { indent: string; cells: string[] } {
  const indent = row.slice(0, row.length - row.trimStart().length)
  let body = row.trim()

  if (body.startsWith("|")) body = body.slice(1)
  if (body.endsWith("|") && !body.endsWith("\\|")) body = body.slice(0, -1)

  const cells: string[] = []
  let cell = ""
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      cell += "\\|"
      i++
      continue
    }
    if (body[i] === "|") {
      cells.push(cell.trim())
      cell = ""
      continue
    }
    cell += body[i]
  }
  cells.push(cell.trim())

  return { indent, cells }
}

function delimiterCell(width: number, alignment: CellAlignment): string {
  switch (alignment) {
    case "center":
      return `:${"-".repeat(Math.max(1, width - 2))}:`
    case "right":
      return `${"-".repeat(Math.max(2, width - 1))}:`
    case "left":
      return `:${"-".repeat(Math.max(2, width - 1))}`
    default:
      return "-".repeat(width)
  }
}

function pad(cell: string, width: number, alignment: CellAlignment): string {
  const missing = Math.max(0, width - displayWidth(cell))
  if (missing === 0) return cell

  switch (alignment) {
    case "right":
      return " ".repeat(missing) + cell
    case "center": {
      const left = Math.floor(missing / 2)
      return " ".repeat(left) + cell + " ".repeat(missing - left)
    }
    default:
      return cell + " ".repeat(missing)
  }
}

function displayWidth(text: string): number {
  return Bun.stringWidth(text)
}
