import type { SimpleHighlight } from "@opentui/core"

const PAIRS: Record<string, string> = { "(": ")", "[": "]", "{": "}", ")": "(", "]": "[", "}": "{" }
const OPENERS = new Set(["(", "[", "{"])

/** A span of text, `end` exclusive, whose brackets are not code. */
export interface TextRange {
  start: number
  end: number
}

/** vim's `%` start: the first bracket at or after the cursor on its line. */
export function bracketFrom(line: string, col: number): number | null {
  for (let i = Math.max(0, col); i < line.length; i++) {
    if (PAIRS[line[i]!]) return i
  }
  return null
}

// `character` is a char literal in C, Rust and Java: '(' there is no bracket.
const isProse = (group: string) => group.startsWith("comment") || group.startsWith("string") || group.startsWith("character")

/**
 * The comment and string captures, merged into sorted, disjoint ranges. A
 * parse nests captures (an escape inside a string), and the outermost range
 * is the one a bracket has to be compared against.
 */
export function skippedRanges(highlights: readonly SimpleHighlight[] | null): TextRange[] {
  if (!highlights) return []
  const spans = highlights
    .filter(([start, end, group]) => end > start && isProse(group))
    .map(([start, end]) => ({ start, end }))
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const merged: TextRange[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.start < last.end) last.end = Math.max(last.end, span.end)
    else merged.push({ ...span })
  }
  return merged
}

function rangeAt(ranges: readonly TextRange[], offset: number): TextRange | null {
  let lo = 0
  let hi = ranges.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const range = ranges[mid]!
    if (offset < range.start) hi = mid - 1
    else if (offset >= range.end) lo = mid + 1
    else return range
  }
  return null
}

/**
 * The offset of the bracket that closes (or opens) the one at `offset`, or
 * null when it is not a bracket or nothing matches it. Only brackets of its
 * own kind count toward the depth. A start inside a string or comment
 * matches within that one, so `"(" … ")"` still pairs up; anywhere else,
 * every bracket in one is passed over.
 */
export function matchBracket(text: string, offset: number, skipped: readonly TextRange[]): number | null {
  const open = text[offset]
  const close = open === undefined ? undefined : PAIRS[open]
  if (!open || !close) return null

  const within = rangeAt(skipped, offset)
  const step = OPENERS.has(open) ? 1 : -1
  const lower = within ? within.start : 0
  const upper = within ? within.end : text.length
  let depth = 0
  for (let i = offset + step; i >= lower && i < upper; i += step) {
    const char = text[i]
    if (char !== open && char !== close) continue
    if (!within && rangeAt(skipped, i)) continue
    if (char === open) depth++
    else if (depth === 0) return i
    else depth--
  }
  return null
}

/** Where each line starts, for turning a 1-based line and column into an offset and back. */
export function lineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1)
  return starts
}

export function offsetOf(starts: readonly number[], lineNum: number, col: number): number | null {
  const start = starts[lineNum - 1]
  return start === undefined ? null : start + col
}

export function positionOf(starts: readonly number[], offset: number): { lineNum: number; col: number } {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return { lineNum: lo + 1, col: offset - starts[lo]! }
}
