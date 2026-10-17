/**
 * What each peek shows, apart from how it is drawn. The four peeks share one
 * shape: a box of a given width over a dimmed screen, a header of coloured
 * segments, a body and a footer.
 */

export type PeekTone = "primary" | "dim" | "text" | "green" | "red" | "blue" | "peach" | "yellow"

export interface PeekSegment {
  text: string
  tone: PeekTone
}

export interface PeekModel {
  id: "line-peek" | "table-peek" | "diagram-peek" | "hunk-peek"
  /** The box's outer width, padding included. */
  width: number
  header: PeekSegment[]
  body: { kind: "rows"; rows: PeekSegment[] } | { kind: "code"; content: string; filetype?: string; width: number }
  footer: string
}

type Side = "new" | "old"
type Scroll = { row: number; col: number }
type Screen = { terminalWidth: number; terminalHeight: number }

/** Header, footer, padding and a row of air above and below the box. */
const CHROME_ROWS = 6
const MAX_WIDTH = 120
const PADDING = 2

const sideLabel = (side: Side): PeekSegment =>
  side === "new" ? { text: "as changed", tone: "green" } : { text: "before the change", tone: "peach" }
const otherVersion = (side: Side) => `Tab: ${side === "new" ? "previous" : "current"} version`
const textRows = (lines: readonly string[]): PeekModel["body"] => ({
  kind: "rows",
  rows: lines.map((text) => ({ text, tone: "text" })),
})
const segments = (...parts: (PeekSegment | null)[]) => parts.filter((part): part is PeekSegment => part !== null)

/**
 * The part of a drawing a window of `rows` × `cols` shows from a scroll
 * position, the position clamped to the drawing — and, when it does not
 * all fit, where the window is, for the header.
 */
export function viewport(
  body: readonly string[],
  scroll: Scroll,
  rows: number,
  cols: number
): { lines: string[]; scrollable: boolean; where: string } {
  const widest = Math.max(0, ...body.map((line) => line.length))
  const row = Math.max(0, Math.min(scroll.row, Math.max(0, body.length - rows)))
  const col = Math.max(0, Math.min(scroll.col, Math.max(0, widest - cols)))
  const lines = body.slice(row, row + rows).map((line) => line.slice(col, col + cols))

  const tall = body.length > rows
  const wide = widest > cols
  const where = [
    tall ? `rows ${row + 1}–${Math.min(body.length, row + rows)} of ${body.length}` : null,
    wide ? `columns ${col + 1}–${Math.min(widest, col + cols)} of ${widest}` : null,
  ]
    .filter(Boolean)
    .join(", ")
  return { lines, scrollable: tall || wide, where }
}

export interface LinePeekInput extends Screen {
  /** The full, unclipped line. */
  content: string
  /** Line number as the file numbers it, when the line has one. */
  lineNumber?: number
  /** Tree-sitter filetype, so the line reads the way it does in the diff. */
  filetype?: string
}

/**
 * The whole of one line, wrapped. The diff cannot wrap without breaking the
 * row-per-line alignment the cursor and every comment anchor rely on, so a
 * line too long to scroll through comfortably is shown where alignment
 * doesn't matter.
 */
export function linePeekModel({ content, lineNumber, filetype, terminalWidth, terminalHeight }: LinePeekInput): PeekModel {
  const width = Math.max(20, Math.min(MAX_WIDTH, terminalWidth - 8))
  const columns = width - PADDING * 2

  // A minified bundle would wrap into more rows than the terminal has, and
  // the box grows with its content — so the line is cut to what fits. The
  // estimate is loose on purpose: word wrapping fits fewer columns per row
  // than this assumes, and cutting a little late beats cutting text that
  // would have fitted.
  const rows = Math.max(1, Math.min(20, terminalHeight - CHROME_ROWS))
  const capacity = columns * rows
  const shown = content.length > capacity ? `${content.slice(0, capacity - 1)}…` : content

  return {
    id: "line-peek",
    width,
    header: [
      { text: lineNumber !== undefined ? `line ${lineNumber}` : "line", tone: "primary" },
      { text: `${content.length} cols`, tone: "dim" },
    ],
    // Left out rather than undefined, so reconcile sees the same keys every pass.
    body: filetype !== undefined
      ? { kind: "code", content: shown, filetype, width: columns }
      : { kind: "code", content: shown, width: columns },
    footer: "Press gl or Esc to close",
  }
}

export interface TablePeekInput extends Screen {
  /** The rendered table, one string per terminal row. */
  lines: string[]
  /** How many source rows the table has, for the header. */
  rowCount: number
  /** Which version of a changed table is on show. */
  side: Side
  /** Whether Tab has another version to switch to. */
  hasOther: boolean
  /** Where the window onto the table sits; clamped to the table here. */
  scroll: Scroll
}

/**
 * The table under the cursor, as a grid. The diff shows a table as its
 * source, the only thing a comment can anchor to, and the source of a table
 * with prose in it is unreadable: this is where you check that it reads right.
 */
export function tablePeekModel({ lines, rowCount, side, hasOther, scroll, terminalWidth, terminalHeight }: TablePeekInput): PeekModel {
  const room = Math.max(3, Math.min(30, terminalHeight - CHROME_ROWS))
  const view = viewport(lines, scroll, room, Math.max(20, terminalWidth - 8))
  return {
    id: "table-peek",
    width: Math.max(...view.lines.map((line) => line.length), 20) + PADDING * 2,
    header: segments(
      { text: "table", tone: "primary" },
      hasOther ? sideLabel(side) : null,
      { text: `${rowCount} rows`, tone: "dim" },
      view.where ? { text: `· ${view.where}`, tone: "yellow" } : null
    ),
    body: textRows(view.lines),
    footer: hasOther ? `${otherVersion(side)} · gl or Esc to close` : "Press gl or Esc to close",
  }
}

/** What the header calls each kind; a flowchart is just "mermaid". */
const DIAGRAM_TITLE: Partial<Record<DiagramPeekInput["kind"], string>> = {
  sequence: "sequence",
  state: "state",
  er: "entities",
}

export interface DiagramPeekInput extends Screen {
  /** The drawing, one string per row. Empty falls back to `source`. */
  lines: string[]
  /** The mermaid source, shown when there is nothing to draw. */
  source: string[]
  kind: "flowchart" | "sequence" | "state" | "er" | "unsupported"
  /** Which version of the block is on show. */
  side: Side
  /** Whether Tab has another version to switch to. */
  hasOther: boolean
  note?: string
  /** Where the window onto the drawing sits; clamped to the drawing here. */
  scroll: Scroll
}

/**
 * The mermaid block under the cursor, drawn. The diff can only show the
 * source, the only thing a comment can anchor to; whether the diagram it
 * describes is right is answered here.
 */
export function diagramPeekModel(input: DiagramPeekInput): PeekModel {
  const { lines, source, kind, side, hasOther, note, scroll, terminalWidth, terminalHeight } = input
  const drawn = lines.length > 0
  // A window onto the drawing, not a clip of it: what does not fit is a
  // scroll away rather than gone (hjkl, like the diff).
  const view = viewport(drawn ? lines : source, scroll, Math.max(3, terminalHeight - CHROME_ROWS), Math.max(20, terminalWidth - 8))
  return {
    id: "diagram-peek",
    width: Math.max(...view.lines.map((line) => line.length), 24) + PADDING * 2,
    header: segments(
      { text: DIAGRAM_TITLE[kind] ?? "mermaid", tone: "primary" },
      sideLabel(side),
      note ? { text: `· ${note}`, tone: "dim" } : null,
      view.where ? { text: `· ${view.where}`, tone: "yellow" } : null,
      drawn ? null : { text: "· source", tone: "dim" }
    ),
    body: textRows(view.lines),
    footer: [hasOther ? otherVersion(side) : null, view.scrollable ? "hjkl to scroll" : null, "gl or Esc to close"]
      .filter(Boolean)
      .join(" · "),
  }
}

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
