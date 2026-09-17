/**
 * The words that changed inside a paired deletion and addition (spec 096).
 *
 * Git pairs lines; this pairs what is inside them. A deletion run followed
 * by an addition run is one change, the nth row of each side two versions
 * of one line, and the spans they do not share are the change the reader is
 * actually looking for.
 */

import type { DiffLineMapping } from "./line-mapping"
import type { DiffLine } from "./types"

/** A run of columns on one row that its partner does not share. */
export interface WordSpan {
  startCol: number
  endCol: number
}

/** What the pair does not share, on each side. */
export interface PairSpans {
  before: WordSpan[]
  after: WordSpan[]
}

/**
 * Past this share of both lines, the spans have nothing left to narrow the
 * reader's eye to — the pair is a deletion and an unrelated addition that
 * happen to sit in the same run, and what they hold in common is
 * punctuation. Painting most of both rows says the two are versions of one
 * line, so nothing is painted and both stay whole.
 *
 * Both, because a short line wholly rewritten into a long one is worth
 * seeing from the long side: the covered share there is what was added
 * around it.
 */
export const MAX_COVERED = 0.6

/**
 * Past this many tokens on a side, the pair is cut back to its common
 * prefix and suffix instead of aligned — the alignment is quadratic, and a
 * minified bundle's one long line is where the tokens come from.
 */
export const MAX_ALIGNED_TOKENS = 400

/**
 * Past this many spans the change is not in a place — it is everywhere, and
 * pointing at all of it points at none of it. Reflowed prose is what
 * produces these: two versions of a paragraph share most of their words in
 * a different order, so the alignment finds them and paints the gaps.
 */
export const MAX_SPANS = 4

const WORD = /[\p{L}\p{N}_]/u
const SPACE = /\s/

/**
 * A line as runs of word characters, runs of whitespace, and single
 * characters otherwise.
 *
 * Columns are UTF-16 indices, the same units the cursor and search speak,
 * so an astral character is one token of length two rather than two tokens
 * holding half a surrogate pair each.
 */
export function tokenize(line: string): string[] {
  const tokens: string[] = []
  let at = 0

  while (at < line.length) {
    const code = line.codePointAt(at)!
    const char = String.fromCodePoint(code)
    const run = WORD.test(char) ? WORD : SPACE.test(char) ? SPACE : null

    if (!run) {
      tokens.push(char)
      at += char.length
      continue
    }

    let end = at + char.length
    while (end < line.length) {
      const next = String.fromCodePoint(line.codePointAt(end)!)
      if (!run.test(next)) break
      end += next.length
    }
    tokens.push(line.slice(at, end))
    at = end
  }

  return tokens
}

interface Alignment {
  keptBefore: boolean[]
  keptAfter: boolean[]
}

/**
 * The longest common subsequence of two token runs, weighted by the
 * characters a token is worth rather than by the count — so keeping one
 * long identifier is preferred to keeping three stray brackets.
 */
function align(before: string[], after: string[]): Alignment {
  const rows = before.length
  const cols = after.length
  const stride = cols + 1
  const table = new Int32Array((rows + 1) * stride)

  for (let row = rows - 1; row >= 0; row--) {
    for (let col = cols - 1; col >= 0; col--) {
      table[row * stride + col] =
        before[row] === after[col]
          ? table[(row + 1) * stride + col + 1]! + before[row]!.length
          : Math.max(table[(row + 1) * stride + col]!, table[row * stride + col + 1]!)
    }
  }

  const keptBefore = new Array<boolean>(rows).fill(false)
  const keptAfter = new Array<boolean>(cols).fill(false)
  let row = 0
  let col = 0
  while (row < rows && col < cols) {
    if (before[row] === after[col]) {
      keptBefore[row] = true
      keptAfter[col] = true
      row++
      col++
    } else if (table[(row + 1) * stride + col]! >= table[row * stride + col + 1]!) {
      row++
    } else {
      col++
    }
  }

  return { keptBefore, keptAfter }
}

/** Total columns of a slice of tokens. */
function width(tokens: string[], from: number, to: number): number {
  let total = 0
  for (let at = from; at < to; at++) total += tokens[at]!.length
  return total
}

/**
 * The unmatched tokens as column ranges, adjacent ones merged.
 *
 * A span of nothing but whitespace is dropped: a reindent moves every
 * column of the line, and a block of colour over the moved indentation
 * says nothing about what the line now does.
 */
function spansOf(line: string, tokens: string[], kept: boolean[], offset: number): WordSpan[] {
  const spans: WordSpan[] = []
  let col = offset
  let open: WordSpan | null = null

  for (let at = 0; at < tokens.length; at++) {
    const size = tokens[at]!.length
    if (kept[at]) {
      if (open) {
        spans.push(open)
        open = null
      }
    } else if (open) {
      open.endCol = col + size
    } else {
      open = { startCol: col, endCol: col + size }
    }
    col += size
  }
  if (open) spans.push(open)

  return spans.filter((span) => line.slice(span.startCol, span.endCol).trim() !== "")
}

/**
 * The spans two versions of a line do not share, or null where the pair is
 * not worth reading as a pair at all.
 */
export function pairSpans(before: string, after: string): PairSpans | null {
  if (before.length === 0 || after.length === 0 || before === after) return null

  const beforeTokens = tokenize(before)
  const afterTokens = tokenize(after)

  // The shared head and tail are the bulk of most pairs, and cutting them
  // off first is what keeps the alignment's quadratic cost small.
  let head = 0
  while (
    head < beforeTokens.length &&
    head < afterTokens.length &&
    beforeTokens[head] === afterTokens[head]
  ) {
    head++
  }
  let tail = 0
  while (
    tail < beforeTokens.length - head &&
    tail < afterTokens.length - head &&
    beforeTokens[beforeTokens.length - 1 - tail] === afterTokens[afterTokens.length - 1 - tail]
  ) {
    tail++
  }

  const beforeMiddle = beforeTokens.slice(head, beforeTokens.length - tail)
  const afterMiddle = afterTokens.slice(head, afterTokens.length - tail)
  if (beforeMiddle.length === 0 && afterMiddle.length === 0) return null

  // The head's tokens are identical on both sides, so they hold the same
  // columns; the tail's are the same distance from each end.
  const offset = width(beforeTokens, 0, head)
  const tailWidth = width(beforeTokens, beforeTokens.length - tail, beforeTokens.length)

  const spans =
    beforeMiddle.length > MAX_ALIGNED_TOKENS || afterMiddle.length > MAX_ALIGNED_TOKENS
      ? {
          before: block(before, offset, before.length - tailWidth),
          after: block(after, offset, after.length - tailWidth),
        }
      : alignedSpans(before, after, beforeMiddle, afterMiddle, offset)

  if (spans.before.length > MAX_SPANS || spans.after.length > MAX_SPANS) return null
  if (
    covered(spans.before) > MAX_COVERED * spoken(before) &&
    covered(spans.after) > MAX_COVERED * spoken(after)
  ) {
    return null
  }

  return keep(spans)
}

function alignedSpans(
  before: string,
  after: string,
  beforeMiddle: string[],
  afterMiddle: string[],
  offset: number
): PairSpans {
  const { keptBefore, keptAfter } = align(beforeMiddle, afterMiddle)
  return {
    before: spansOf(before, beforeMiddle, keptBefore, offset),
    after: spansOf(after, afterMiddle, keptAfter, offset),
  }
}

/** Columns the spans hold between them. */
function covered(spans: WordSpan[]): number {
  let total = 0
  for (const span of spans) total += span.endCol - span.startCol
  return total
}

/**
 * Columns the line says something in — its indentation is not among them.
 *
 * Two lines at the same depth always share their indentation, and counting
 * that as common ground is how four levels of nesting let a pair of
 * unrelated statements through: twelve leading columns are a quarter of the
 * line nobody wrote.
 */
function spoken(line: string): number {
  return Math.max(1, line.trim().length)
}

/** One span for a whole middle, for the pairs too long to align. */
function block(line: string, startCol: number, endCol: number): WordSpan[] {
  if (endCol <= startCol) return []
  return line.slice(startCol, endCol).trim() === "" ? [] : [{ startCol, endCol }]
}

/** A pair whose spans all fell away has nothing to say about either row. */
function keep(spans: PairSpans): PairSpans | null {
  return spans.before.length > 0 || spans.after.length > 0 ? spans : null
}

/**
 * Whether a run's two sides say the same thing, the line breaks aside.
 *
 * A rewrapped paragraph is a real diff with no changed words in it: a word
 * crosses a line boundary, and every pair in the run then comes out with
 * one span at an edge pointing at a word that did not change. Highlighting
 * it is worse than highlighting nothing, because it says something moved
 * when only the wrapping did.
 */
function onlyRewrapped(before: readonly string[], after: readonly string[]): boolean {
  return flatten(before) === flatten(after)
}

/** A run's text as one line, however it happened to be broken up. */
function flatten(lines: readonly string[]): string {
  return lines.join(" ").replace(/\s+/g, " ").trim()
}

/**
 * Whether a row's `content` is the file's own text.
 *
 * A folded fence's row says `\`\`\`ts ▸ 5 lines`, which is riff's chrome, and
 * an aligned markdown table's row is padded onto a grid with its truth in
 * `sourceContent` — spans found there would need mapping back through the
 * padding to land right. Neither is where this earns anything.
 */
function readsAsSource(line: DiffLine): boolean {
  return line.sourceContent === undefined && line.blockFoldId === undefined
}

/**
 * The spans to paint, by visual line.
 *
 * Walked once per mapping: a fold, a refresh or a file coming into view
 * builds a new mapping, and the rows move with it.
 */
export function computeWordDiff(mapping: DiffLineMapping): Map<number, WordSpan[]> {
  const spans = new Map<number, WordSpan[]>()
  const count = mapping.lineCount
  let row = 0

  while (row < count) {
    if (mapping.getLine(row)?.type !== "deletion") {
      row++
      continue
    }

    const deletions: number[] = []
    while (row < count && mapping.getLine(row)?.type === "deletion") deletions.push(row++)
    // `\ No newline at end of file` belongs to neither run, and must not
    // end the change before the additions are reached.
    while (row < count && mapping.getLine(row)?.type === "no-newline") row++
    const additions: number[] = []
    while (row < count && mapping.getLine(row)?.type === "addition") additions.push(row++)

    const said = (rows: number[]) => rows.map((row) => mapping.getLine(row)!.content)
    if (onlyRewrapped(said(deletions), said(additions))) continue

    // Where the runs are uneven the tail has no partner and stays whole.
    const pairs = Math.min(deletions.length, additions.length)
    for (let at = 0; at < pairs; at++) {
      const before = mapping.getLine(deletions[at]!)!
      const after = mapping.getLine(additions[at]!)!
      if (before.fileIndex !== after.fileIndex) continue
      if (!readsAsSource(before) || !readsAsSource(after)) continue

      const found = pairSpans(before.content, after.content)
      if (!found) continue
      if (found.before.length > 0) spans.set(deletions[at]!, found.before)
      if (found.after.length > 0) spans.set(additions[at]!, found.after)
    }
  }

  return spans
}
