import type { CommentScope } from "../../diff-rows/comment-scope"
import { rowOfLine, type SplitRows } from "../../diff-rows/row-source"
import { hunksOf } from "../../providers/agent/hunks"
import type { ExcerptLine, Position } from "../../providers/agent/position"
import type { DiffFile } from "../../utils/diff-parser"
import { getSelectionRange } from "../../vim-diff/cursor-state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { CommentAnchor, DiffLine, VimCursorState } from "../../vim-diff/types"

export const EXCERPT_RADIUS = 20

export interface PositionInput {
  mapping: DiffLineMapping
  vim: Pick<VimCursorState, "line" | "mode" | "selectionAnchor">
  /** What comment anchoring would cover: the selection's lines as drawn, and the split pane they are read from. */
  scope: CommentScope
  files: readonly DiffFile[]
  /** The split rows the scope was read from; unified has none. */
  rows?: SplitRows | null
}

type Side = NonNullable<Position["side"]>

const KINDS: Partial<Record<DiffLine["type"], ExcerptLine["kind"]>> = {
  addition: "added",
  deletion: "removed",
  context: "context",
}

const numberOn = (line: DiffLine, side: Side) => (side === "old" ? line.oldLineNum : line.newLineNum)

/**
 * Where the reviewer stands when a question is sent: the line under the
 * cursor on the side comment anchoring would pick, with the run of diff
 * lines around it as drawn, expanded context included.
 */
export function chatPositionOf({ mapping, vim, scope, files, rows }: PositionInput): Position | null {
  const line = mapping.getLine(vim.line)
  if (!line?.filename) return null
  const path = line.filename
  const file = files.find((f) => f.filename === path)
  const selecting = getSelectionRange(vim) !== null
  const selectionOnSide = (side: Side) => (selecting ? selectionOn(mapping, scope.lines, path, side) : undefined)
  // A split pane draws one side only, so only unified selects rows of both.
  const otherSelectionOf = (side: Side) => {
    const otherSelection = rows ? undefined : selectionOnSide(side === "old" ? "new" : "old")
    return otherSelection ? { otherSelection } : {}
  }

  const onDivider = line.type === "divider" || line.type === "hunk-header"
  const anchored = !onDivider
    ? anchoredLine(mapping, vim.line, scope.pane, rows ?? null, path)
    : selecting
      ? nearestSelected(mapping, vim.line, scope, path)
      : null
  if (!anchored) {
    const side: Side = scope.pane === "left" ? "old" : "new"
    const selection = selectionOnSide(side)
    if (!selection) return (onDivider && hunkBelow(mapping, vim.line, path, file)) || { path, excerpt: [], label: path }
    return { path, excerpt: [], side, label: labelOf(path, side, selection), selection, ...otherSelectionOf(side) }
  }

  const { index: at, anchor } = anchored
  const side: Side = anchor.side === "LEFT" ? "old" : "new"
  const { excerpt, cursorIndex } = excerptAround(mapping, at, path)
  const selection = selectionOnSide(side)
  const hunkHeader = hunkHeaderOf(file, side, anchor.line)
  const oldLine = !rows && !selecting ? contextOldLine(mapping.getLine(at)) : undefined
  return {
    path,
    side,
    line: anchor.line,
    ...(oldLine !== undefined ? { oldLine } : {}),
    ...(hunkHeader ? { hunkHeader } : {}),
    excerpt,
    cursorIndex,
    label: labelOf(path, side, selection ?? { start: anchor.line, end: anchor.line }),
    ...(selection ? { selection, ...otherSelectionOf(side) } : {}),
  }
}

const contextOldLine = (line: DiffLine | undefined) => (line?.type === "context" ? line.oldLineNum : undefined)

function labelOf(path: string, side: Side, { start, end }: { start: number; end: number }): string {
  const place = start === end ? String(start) : `${start}-${end}`
  return `${path}:${place}${side === "old" ? " (old)" : ""}`
}

interface Anchored {
  index: number
  anchor: CommentAnchor
}

function anchoredAt(mapping: DiffLineMapping, index: number, pane: CommentScope["pane"]): Anchored | null {
  if (mapping.getLine(index)?.blockFoldId) return null
  const anchor = mapping.getCommentAnchor(index, pane)
  return anchor ? { index, anchor } : null
}

/**
 * A divider is in no hunk, so a selection reaching it is placed by the
 * selected line nearest the cursor: the selection's hunk, not the one below
 * the divider. A tie goes to the lower mapping index, the line above,
 * whatever order the scope lists its lines in. Only the divider's own file
 * counts, since the position is labelled with its path.
 */
function nearestSelected(
  mapping: DiffLineMapping,
  cursor: number,
  scope: CommentScope,
  path: string,
): Anchored | null {
  const nearer = (a: number, b: number) => Math.abs(a - cursor) - Math.abs(b - cursor) || a - b
  let best: Anchored | null = null
  for (const index of scope.lines) {
    if (mapping.getLine(index)?.filename !== path) continue
    const hit = anchoredAt(mapping, index, scope.pane)
    if (hit && (!best || nearer(index, best.index) < 0)) best = hit
  }
  return best
}

// Expanded context counts as much as a hunk's own lines, and "\ No newline"
// sits between lines without ending the run.
const walkable = (line: DiffLine | undefined, path: string) =>
  line?.filename === path && (KINDS[line.type] !== undefined || line.type === "no-newline")

/**
 * The line a question is anchored on. In split, the active half of the
 * cursor's row may be empty, and then the cursor holds the other half's
 * line; the nearest row with a line in this pane stands in, the one above
 * on a tie. The walk stops at a divider, not at a hunk's edge, so it
 * carries on into expanded context or into a hunk that follows with no
 * lines skipped. A folded block is no line, so it anchors on none, as in
 * unified.
 */
function anchoredLine(
  mapping: DiffLineMapping,
  cursor: number,
  pane: CommentScope["pane"],
  rows: SplitRows | null,
  path: string,
): Anchored | null {
  if (mapping.getLine(cursor)?.blockFoldId) return null
  const own = anchoredAt(mapping, cursor, pane)
  if (own || !rows || !pane) return own
  const start = rowOfLine(cursor, rows)
  const hit = (r: number) => {
    const row = rows.rows[r]
    const index = row?.kind === "line" ? row.index : row?.[rows.side]
    return index === undefined ? null : anchoredAt(mapping, index, pane)
  }
  // Expanded context is drawn with no divider before the hunk, so the walk carries on into it.
  const within = (r: number) => {
    const row = rows.rows[r]
    if (!row) return false
    const index = row.kind === "line" ? row.index : (row.left ?? row.right)!
    return walkable(mapping.getLine(index), path)
  }
  let [up, down] = [true, true]
  for (let d = 1; up || down; d++) {
    up &&= within(start - d)
    const above = up ? hit(start - d) : null
    if (above) return above
    down &&= within(start + d)
    const below = down ? hit(start + d) : null
    if (below) return below
  }
  return null
}

/**
 * A divider standing right above a hunk is that hunk: its header, and its
 * first lines in place of the line the cursor is not on.
 */
function hunkBelow(
  mapping: DiffLineMapping,
  index: number,
  path: string,
  file: DiffFile | undefined,
): Position | null {
  let first = index + 1
  while (mapping.getLine(first)?.type === "hunk-header") first++
  const line = mapping.getLine(first)
  if (!line || line.filename !== path || !KINDS[line.type] || line.blockFoldId) return null
  const side: Side = line.newLineNum !== undefined ? "new" : "old"
  const hunkHeader = hunkHeaderOf(file, side, numberOn(line, side)!)
  if (!hunkHeader) return null
  return { path, hunkHeader, excerpt: collect(mapping, first, 1, path, EXCERPT_RADIUS + 1), label: path }
}

/** The mapping's lines either side of the cursor, up to the radius, a divider, a fold or the file's edge. */
function excerptAround(mapping: DiffLineMapping, index: number, path: string) {
  const before = collect(mapping, index - 1, -1, path).reverse()
  const after = collect(mapping, index + 1, 1, path)
  const excerpt = [...before, excerptLine(mapping.getLine(index)!), ...after]
  return { excerpt, cursorIndex: before.length }
}

function collect(
  mapping: DiffLineMapping,
  from: number,
  step: 1 | -1,
  path: string,
  limit = EXCERPT_RADIUS,
): ExcerptLine[] {
  const lines: ExcerptLine[] = []
  for (let i = from; lines.length < limit; i += step) {
    const line = mapping.getLine(i)
    if (!line || line.filename !== path) break
    // "\ No newline" sits between real lines without being one.
    if (line.type === "no-newline") continue
    if (!KINDS[line.type] || line.blockFoldId) break
    lines.push(excerptLine(line))
  }
  return lines
}

function excerptLine(line: DiffLine): ExcerptLine {
  return {
    kind: KINDS[line.type] ?? "context",
    text: line.sourceContent ?? line.content,
    ...(line.oldLineNum !== undefined ? { oldLine: line.oldLineNum } : {}),
    ...(line.newLineNum !== undefined ? { newLine: line.newLineNum } : {}),
  }
}

// Expanded context lies outside every hunk, so it finds none.
function hunkHeaderOf(file: DiffFile | undefined, side: Side, line: number): string | undefined {
  if (!file) return undefined
  const key = side === "old" ? "oldLine" : "newLine"
  return hunksOf(file).find((hunk) => hunk.lines.some((l) => l[key] === line))?.header
}

/**
 * The selection's line numbers on the position's side; a line drawn only on
 * the other side has none. The scope, not a span of mapping indices: split
 * holds a run's removals before its additions, so a span would reach rows
 * the reviewer never selected.
 */
function selectionOn(
  mapping: DiffLineMapping,
  lines: readonly number[],
  path: string,
  side: Side,
): Position["selection"] {
  const numbers: number[] = []
  for (const index of lines) {
    const line = mapping.getLine(index)
    if (line?.filename !== path || !KINDS[line.type]) continue
    const n = numberOn(line, side)
    if (n !== undefined) numbers.push(n)
  }
  if (numbers.length === 0) return undefined
  return { start: Math.min(...numbers), end: Math.max(...numbers) }
}
