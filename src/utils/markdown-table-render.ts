/**
 * Draw a markdown table as a grid whose cells wrap.
 *
 * OpenTUI's own table renderer gives every cell exactly one row and cuts
 * whatever does not fit, so a table with prose in it loses most of its
 * text without saying so. A review table — approaches against pros and
 * cons — is all prose, which makes that the one shape it cannot show.
 *
 * Cells here wrap to their column and the row grows to the tallest one,
 * the way the table reads on GitHub. `<li>` becomes a bullet on its own
 * line, since a list crammed into a table cell is the reason these rows
 * are long in the first place.
 */

import type { CellAlignment } from "./markdown-tables"

/** Below this a column holds no readable word, so the table stops shrinking. */
const MIN_COLUMN_WIDTH = 8
/** Every column costs a border and two spaces of padding. */
const COLUMN_CHROME = 3

export interface TableModel {
  header: string[]
  rows: string[][]
  alignments: CellAlignment[]
}

/**
 * Render the table into terminal lines that fit `width`. Returns an empty
 * array for a table with no columns.
 */
export function renderMarkdownTable(table: TableModel, width: number): string[] {
  const columns = Math.max(table.header.length, ...table.rows.map((row) => row.length), 0)
  if (columns === 0) return []

  const cells = [table.header, ...table.rows].map((row) =>
    Array.from({ length: columns }, (_, column) => cellLines(row[column] ?? ""))
  )

  const widths = columnWidths(cells, columns, width)
  const out: string[] = []

  out.push(rule(widths, "┌", "┬", "┐"))
  out.push(...renderRow(cells[0] ?? [], widths, table.alignments))
  out.push(rule(widths, "├", "┼", "┤"))

  for (let row = 1; row < cells.length; row++) {
    if (row > 1) out.push(rule(widths, "├", "┼", "┤"))
    out.push(...renderRow(cells[row]!, widths, table.alignments))
  }

  out.push(rule(widths, "└", "┴", "┘"))
  return out
}

/**
 * A cell's text as the lines it wants, before wrapping: HTML lists become
 * bullets, `<br>` becomes a break, and the markdown emphasis markers come
 * off — nothing here can render them, and they only cost width.
 */
export function cellLines(text: string): string[] {
  const plain = text
    .replace(/<\/li>\s*/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/?[uo]l>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")

  return plain
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line !== "" || (index > 0 && index < all.length - 1))
}

/**
 * Share the available width between columns. Everything fits at its
 * natural width when there is room; otherwise the columns shrink in
 * proportion to what they hold, and none below a readable minimum.
 */
function columnWidths(cells: string[][][], columns: number, width: number): number[] {
  const natural: number[] = []
  for (let column = 0; column < columns; column++) {
    let widest = 1
    for (const row of cells) {
      for (const line of row[column] ?? []) {
        widest = Math.max(widest, displayWidth(line))
      }
    }
    natural[column] = widest
  }

  const available = width - columns * COLUMN_CHROME - 1
  const total = natural.reduce((sum, value) => sum + value, 0)
  if (available <= 0) return natural.map(() => MIN_COLUMN_WIDTH)
  if (total <= available) return natural

  const floor = Math.min(MIN_COLUMN_WIDTH, Math.max(1, Math.floor(available / columns)))
  const widths = natural.map((value) =>
    Math.max(floor, Math.floor((available * value) / total))
  )

  // Hand the rounding remainder to the widest column rather than losing it.
  const used = widths.reduce((sum, value) => sum + value, 0)
  if (used < available) {
    const widest = widths.indexOf(Math.max(...widths))
    widths[widest] = widths[widest]! + (available - used)
  }

  return widths
}

function renderRow(row: string[][], widths: number[], alignments: CellAlignment[]): string[] {
  const wrapped = widths.map((width, column) => wrapCell(row[column] ?? [], width))
  const height = Math.max(1, ...wrapped.map((lines) => lines.length))

  const out: string[] = []
  for (let line = 0; line < height; line++) {
    const cells = widths.map((width, column) =>
      ` ${pad(wrapped[column]![line] ?? "", width, alignments[column] ?? "default")} `
    )
    out.push(`│${cells.join("│")}│`)
  }
  return out
}

/**
 * Wrap on words, breaking a word that cannot fit on a line of its own.
 * A bullet's continuation lines are indented under its text, so a list of
 * two long items does not read as four.
 */
function wrapCell(lines: string[], width: number): string[] {
  const out: string[] = []

  for (const line of lines) {
    const hanging = line.startsWith("• ") ? "  " : ""
    let current = ""
    const flush = (): void => {
      out.push(current)
      current = hanging
    }

    for (const word of line.split(/\s+/).filter(Boolean)) {
      const candidate = current && current !== hanging ? `${current} ${word}` : `${current}${word}`
      if (displayWidth(candidate) <= width) {
        current = candidate
        continue
      }
      if (current && current !== hanging) flush()

      let rest = word
      while (displayWidth(`${current}${rest}`) > width && displayWidth(rest) > width - hanging.length) {
        const room = Math.max(1, width - displayWidth(current))
        out.push(current + rest.slice(0, room))
        rest = rest.slice(room)
        current = hanging
      }
      current = `${current}${rest}`
    }

    out.push(current)
  }

  return out
}

function rule(widths: number[], left: string, join: string, right: string): string {
  return left + widths.map((width) => "─".repeat(width + 2)).join(join) + right
}

function pad(text: string, width: number, alignment: CellAlignment): string {
  const missing = Math.max(0, width - displayWidth(text))
  switch (alignment) {
    case "right":
      return " ".repeat(missing) + text
    case "center": {
      const left = Math.floor(missing / 2)
      return " ".repeat(left) + text + " ".repeat(missing - left)
    }
    default:
      return text + " ".repeat(missing)
  }
}

function displayWidth(text: string): number {
  return Bun.stringWidth(text)
}
