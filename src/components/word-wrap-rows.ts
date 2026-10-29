const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** The characters OpenTUI's word wrap may break after, besides whitespace. */
const BREAK_AFTER = new Set([..."-/\\.,;:!?()[]{}\u2010\u200b、。，！？："])
const WHITESPACE = /^\s$/u
/**
 * Kana, hangul and the CJK ideographs, which OpenTUI may break between any
 * two of, and between one of them and an ASCII letter, digit or underscore,
 * but not between one of them and any other character.
 */
const CJK = /^[\u1100-\u11ff\u3040-\u30ff\u3130-\u318f\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff\uff66-\uff9f\u{20000}-\u{3ffff}]/u
const ASCII_WORD = /^\w/

type CharClass = "cjk" | "word" | "other"

const charClass = (grapheme: string): CharClass =>
  CJK.test(grapheme) ? "cjk" : ASCII_WORD.test(grapheme) ? "word" : "other"

const breaksBetween = (before: CharClass, after: CharClass) =>
  (before === "cjk" && after !== "other") || (after === "cjk" && before === "word")

interface WrapUnit {
  widths: number[]
  space: boolean
}

/** The line cut where OpenTUI may break it, each piece with its graphemes' widths. */
function wrapUnits(line: string): WrapUnit[] {
  const units: WrapUnit[] = []
  let current: WrapUnit | null = null
  let previous: CharClass = "other"
  const flush = () => {
    if (current) units.push(current)
    current = null
  }
  for (const { segment } of graphemes.segment(line)) {
    const space = WHITESPACE.test(segment)
    const kind = charClass(segment)
    if (current && (current.space !== space || breaksBetween(previous, kind))) flush()
    previous = kind
    current ??= { widths: [], space }
    current.widths.push(Bun.stringWidth(segment))
    if (BREAK_AFTER.has(segment)) flush()
  }
  flush()
  return units
}

/**
 * The rows one line of text takes in a textarea `columns` wide with
 * `wrapMode="word"`, as OpenTUI wraps it: a piece that does not fit moves
 * to the next row, and one wider than a row breaks by character. Spaces
 * after a word hang past the edge rather than open a row, but a line's
 * leading spaces are indentation and wrap like a word.
 */
export function wordWrapRows(line: string, columns: number): number {
  const width = Math.max(1, columns)
  let rows = 1
  let used = 0
  let reached = false
  for (const unit of wrapUnits(line)) {
    if (unit.space && reached) {
      used += sum(unit.widths)
      continue
    }
    if (used + sum(unit.widths) > width) {
      if (used > 0) {
        rows++
        used = 0
      }
      for (const cell of unit.widths) {
        if (used + cell > width && used > 0) {
          rows++
          used = 0
        }
        used += cell
      }
    } else {
      used += sum(unit.widths)
    }
    reached ||= !unit.space
  }
  return rows
}

const sum = (widths: readonly number[]) => widths.reduce((total, width) => total + width, 0)
