/**
 * Text objects for the diff view (spec 055).
 *
 * Pure resolution: a mapping, a cursor and the object key in, a span out.
 * Two kinds of object live here — the ones vim has (word, quoted string,
 * bracket pair) and the ones only a diff has (hunk, file, a run of added or
 * deleted rows).
 */

import type { DiffLineMapping } from "./line-mapping"
import type { DiffLine } from "./types"

export type TextObjectSpan =
  | {
      kind: "charwise"
      startLine: number
      /** Inclusive. */
      startCol: number
      endLine: number
      /** Inclusive, as vim's selection is. */
      endCol: number
    }
  | { kind: "linewise"; startLine: number; endLine: number }

/** Rows that carry no code — every object stops at them. */
const STRUCTURAL = new Set(["file-header", "hunk-header", "divider", "spacing", "no-newline"])

const BRACKETS: Record<string, [string, string]> = {
  "(": ["(", ")"],
  ")": ["(", ")"],
  b: ["(", ")"],
  "{": ["{", "}"],
  "}": ["{", "}"],
  B: ["{", "}"],
  "[": ["[", "]"],
  "]": ["[", "]"],
  "<": ["<", ">"],
  ">": ["<", ">"],
}

const QUOTES = new Set(['"', "'", "`"])

export function resolveTextObject(
  mapping: DiffLineMapping,
  line: number,
  col: number,
  scope: "i" | "a",
  key: string
): TextObjectSpan | null {
  if (key === "w" || key === "W") return wordObject(mapping, line, col, scope, key === "W")
  if (QUOTES.has(key)) return quoteObject(mapping, line, col, scope, key)
  if (BRACKETS[key]) return bracketObject(mapping, line, col, scope, BRACKETS[key]!)
  if (key === "h") return hunkObject(mapping, line, scope)
  if (key === "f") return fileObject(mapping, line, scope)
  if (key === "+") return changeRunObject(mapping, line, "addition")
  if (key === "-") return changeRunObject(mapping, line, "deletion")
  return null
}

/**
 * The version of the file a bracket search reads. A `{` on a deleted line and
 * a `}` on an added one were never a pair in either version, so the search
 * walks one side only — the new one, unless the cursor sits on a deletion.
 */
type Side = "old" | "new"

interface Walk {
  side: Side
  fileIndex: number | undefined
}

function walkFrom(cursor: DiffLine): Walk {
  return {
    side: cursor.type === "deletion" ? "old" : "new",
    fileIndex: cursor.fileIndex,
  }
}

function existsOn(row: DiffLine, side: Side): boolean {
  if (row.type === "addition") return side === "new"
  if (row.type === "deletion") return side === "old"
  return true
}

type CharClass = "word" | "punct" | "space"

function classify(char: string, big: boolean): CharClass {
  if (/\s/.test(char)) return "space"
  if (big) return "word"
  return /[A-Za-z0-9_]/.test(char) ? "word" : "punct"
}

function wordObject(
  mapping: DiffLineMapping,
  line: number,
  col: number,
  scope: "i" | "a",
  big: boolean
): TextObjectSpan | null {
  const row = mapping.getLine(line)
  if (!row || STRUCTURAL.has(row.type)) return null

  const text = mapping.getLineContent(line)
  if (text.length === 0) return null

  const at = Math.min(col, text.length - 1)
  const cls = classify(text[at]!, big)

  let start = at
  while (start > 0 && classify(text[start - 1]!, big) === cls) start--
  let end = at
  while (end < text.length - 1 && classify(text[end + 1]!, big) === cls) end++

  if (scope === "a") {
    // Trailing whitespace, or leading when there is none — vim's `aw`.
    let extended = end
    while (extended < text.length - 1 && classify(text[extended + 1]!, big) === "space") extended++
    if (extended > end) {
      end = extended
    } else {
      while (start > 0 && classify(text[start - 1]!, big) === "space") start--
    }
  }

  return { kind: "charwise", startLine: line, startCol: start, endLine: line, endCol: end }
}

function quoteObject(
  mapping: DiffLineMapping,
  line: number,
  col: number,
  scope: "i" | "a",
  quote: string
): TextObjectSpan | null {
  const row = mapping.getLine(line)
  if (!row || STRUCTURAL.has(row.type)) return null

  const text = mapping.getLineContent(line)
  const positions: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] === quote && text[i - 1] !== "\\") positions.push(i)
  }

  // Quotes pair off left to right, so the cursor picks the pair it sits in —
  // or, as in vim, the next one along when it sits outside every pair.
  for (let i = 0; i + 1 < positions.length; i += 2) {
    const open = positions[i]!
    const close = positions[i + 1]!
    if (col > close) continue

    const [start, end] = scope === "a" ? [open, close] : [open + 1, close - 1]
    if (start > end) return null
    return { kind: "charwise", startLine: line, startCol: start, endLine: line, endCol: end }
  }

  return null
}

interface BracketPos {
  line: number
  col: number
}

function bracketObject(
  mapping: DiffLineMapping,
  line: number,
  col: number,
  scope: "i" | "a",
  [open, close]: [string, string]
): TextObjectSpan | null {
  const cursor = mapping.getLine(line)
  if (!cursor || STRUCTURAL.has(cursor.type)) return null
  const walk = walkFrom(cursor)

  const openPos = findUnmatched(mapping, walk, line, col, open, close, "backward")
  if (!openPos) return null
  const closePos = findUnmatched(mapping, walk, openPos.line, openPos.col, open, close, "forward")
  if (!closePos) return null

  if (scope === "a") {
    return {
      kind: "charwise",
      startLine: openPos.line,
      startCol: openPos.col,
      endLine: closePos.line,
      endCol: closePos.col,
    }
  }

  // A block whose braces bookend their lines is a run of lines, not a run of
  // characters — selecting it linewise is what makes `vi{` useful on code.
  const openTail = mapping.getLineContent(openPos.line).slice(openPos.col + 1)
  const closeHead = mapping.getLineContent(closePos.line).slice(0, closePos.col)
  if (openTail.trim() === "" && closeHead.trim() === "" && closePos.line - openPos.line > 1) {
    return { kind: "linewise", startLine: openPos.line + 1, endLine: closePos.line - 1 }
  }

  const inner = advance(mapping, walk, openPos, 1)
  const innerEnd = advance(mapping, walk, closePos, -1)
  if (!inner || !innerEnd) return null
  if (
    inner.line > innerEnd.line ||
    (inner.line === innerEnd.line && inner.col > innerEnd.col)
  ) {
    return null
  }
  return {
    kind: "charwise",
    startLine: inner.line,
    startCol: inner.col,
    endLine: innerEnd.line,
    endCol: innerEnd.col,
  }
}

/**
 * Walk outwards for the bracket that encloses the cursor, counting depth so
 * nested pairs are skipped. Only rows on the cursor's side of the diff count,
 * and the walk stops dead at a structural row: what lies behind a collapsed
 * divider is unknown, and guessing a partner there would select nonsense.
 */
function findUnmatched(
  mapping: DiffLineMapping,
  walk: Walk,
  fromLine: number,
  fromCol: number,
  open: string,
  close: string,
  direction: "forward" | "backward"
): BracketPos | null {
  const step = direction === "forward" ? 1 : -1
  const wanted = direction === "forward" ? close : open
  const other = direction === "forward" ? open : close

  let depth = 0
  let pos: BracketPos | null = { line: fromLine, col: fromCol }

  // The cursor's own character counts as the bracket when it is one, so
  // `vi{` works with the cursor parked on the brace.
  if (mapping.getLineContent(fromLine)[fromCol] === wanted) return pos

  while (pos) {
    pos = advance(mapping, walk, pos, step)
    if (!pos) return null
    const char = mapping.getLineContent(pos.line)[pos.col]
    if (char === other) {
      depth++
    } else if (char === wanted) {
      if (depth === 0) return pos
      depth--
    }
  }
  return null
}

/**
 * One character along, crossing into the next eligible row when the current
 * one runs out. Returns null at a structural row, at the file's edge, or when
 * the row belongs to the other version of the file.
 */
function advance(
  mapping: DiffLineMapping,
  walk: Walk,
  pos: BracketPos,
  step: 1 | -1
): BracketPos | null {
  let line = pos.line
  let col = pos.col + step

  while (true) {
    const text = mapping.getLineContent(line)
    if (col >= 0 && col < text.length) return { line, col }

    const nextLine = line + step
    const next = mapping.getLine(nextLine)
    if (!next || STRUCTURAL.has(next.type)) return null
    if (next.fileIndex !== walk.fileIndex) return null

    line = nextLine
    const nextText = mapping.getLineContent(nextLine)
    // A row from the other version, or an empty one, has nothing to land on:
    // park out of range so the next turn of the loop walks past it.
    col = existsOn(next, walk.side)
      ? step === 1
        ? 0
        : nextText.length - 1
      : step === 1
        ? nextText.length
        : -1
  }
}

function isContent(row: DiffLine | undefined): row is DiffLine {
  return row !== undefined && !STRUCTURAL.has(row.type)
}

function hunkObject(
  mapping: DiffLineMapping,
  line: number,
  scope: "i" | "a"
): TextObjectSpan | null {
  const row = mapping.getLine(line)
  if (!isContent(row)) return null

  let start = line
  while (start > 0) {
    const above = mapping.getLine(start - 1)
    if (!isContent(above) || above.fileIndex !== row.fileIndex) break
    start--
  }
  let end = line
  while (end < mapping.lineCount - 1) {
    const below = mapping.getLine(end + 1)
    if (!isContent(below) || below.fileIndex !== row.fileIndex) break
    end++
  }

  if (scope === "a") {
    // The divider that closes the hunk, or the one that opens it when the
    // hunk runs to the end of the file — `aw`'s rule, applied to context gaps.
    if (mapping.getLine(end + 1)?.type === "divider") end++
    else if (mapping.getLine(start - 1)?.type === "divider") start--
  }

  return { kind: "linewise", startLine: start, endLine: end }
}

function fileObject(
  mapping: DiffLineMapping,
  line: number,
  scope: "i" | "a"
): TextObjectSpan | null {
  const row = mapping.getLine(line)
  if (!row) return null
  const fileIndex = row.fileIndex

  let start = line
  while (start > 0 && mapping.getLine(start - 1)?.fileIndex === fileIndex) start--
  let end = line
  while (end < mapping.lineCount - 1 && mapping.getLine(end + 1)?.fileIndex === fileIndex) end++

  if (scope === "i") {
    while (start <= end && !isContent(mapping.getLine(start))) start++
    while (end >= start && !isContent(mapping.getLine(end))) end--
    if (start > end) return null
  }

  return { kind: "linewise", startLine: start, endLine: end }
}

function changeRunObject(
  mapping: DiffLineMapping,
  line: number,
  type: "addition" | "deletion"
): TextObjectSpan | null {
  if (mapping.getLine(line)?.type !== type) return null

  let start = line
  while (start > 0 && mapping.getLine(start - 1)?.type === type) start--
  let end = line
  while (end < mapping.lineCount - 1 && mapping.getLine(end + 1)?.type === type) end++

  return { kind: "linewise", startLine: start, endLine: end }
}
