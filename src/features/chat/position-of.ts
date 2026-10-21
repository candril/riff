import type { CommentScope } from "../../diff-rows/comment-scope"
import { hunksOf } from "../../providers/agent/hunks"
import type { ExcerptLine, Position } from "../../providers/agent/position"
import type { DiffFile } from "../../utils/diff-parser"
import { getSelectionRange } from "../../vim-diff/cursor-state"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffLine, VimCursorState } from "../../vim-diff/types"

export const EXCERPT_RADIUS = 20

export interface PositionInput {
  mapping: DiffLineMapping
  vim: Pick<VimCursorState, "line" | "mode" | "selectionAnchor">
  /** What comment anchoring would cover: the selection's lines as drawn, and the split pane they are read from. */
  scope: CommentScope
  files: readonly DiffFile[]
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
export function chatPositionOf({ mapping, vim, scope, files }: PositionInput): Position | null {
  const line = mapping.getLine(vim.line)
  if (!line?.filename) return null
  const path = line.filename
  const anchor = line.blockFoldId ? null : mapping.getCommentAnchor(vim.line, scope.pane)
  if (!anchor) return { path, excerpt: [], label: path }

  const side: Side = anchor.side === "LEFT" ? "old" : "new"
  const { excerpt, cursorIndex } = excerptAround(mapping, vim.line, path)
  const selection = getSelectionRange(vim) ? selectionOn(mapping, scope.lines, path, side) : undefined
  const suffix = side === "old" ? " (old)" : ""
  const place = selection ? `${selection.start}-${selection.end}` : String(anchor.line)
  const hunkHeader = hunkHeaderOf(files.find((file) => file.filename === path), side, anchor.line)
  return {
    path,
    side,
    line: anchor.line,
    ...(hunkHeader ? { hunkHeader } : {}),
    excerpt,
    cursorIndex,
    label: `${path}:${place}${suffix}`,
    ...(selection ? { selection } : {}),
  }
}

/** The mapping's lines either side of the cursor, up to the radius, a divider, a fold or the file's edge. */
function excerptAround(mapping: DiffLineMapping, index: number, path: string) {
  const before = collect(mapping, index - 1, -1, path).reverse()
  const after = collect(mapping, index + 1, 1, path)
  const excerpt = [...before, excerptLine(mapping.getLine(index)!), ...after]
  return { excerpt, cursorIndex: before.length }
}

function collect(mapping: DiffLineMapping, from: number, step: 1 | -1, path: string): ExcerptLine[] {
  const lines: ExcerptLine[] = []
  for (let i = from; lines.length < EXCERPT_RADIUS; i += step) {
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
