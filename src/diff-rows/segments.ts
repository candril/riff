import { TextAttributes } from "@opentui/core"
import { theme } from "../theme"
import type { WordSpan } from "../vim-diff/word-diff"
import { SYNTAX_PALETTE, styleOfCapture } from "./syntax-palette"

/** How far flash's backdrop pulls text towards the background it sits on. */
export const FLASH_BACKDROP_STRENGTH = 0.7

// OpenTUI's text buffer draws a tab as two cells wherever it sits, not up to a tab stop.
export const TAB = "  "

export interface Segment {
  text: string
  fg: string
  bg?: string
  attributes: number
}

/** Columns are raw UTF-16 units of the line's content, the cursor's columns. */
export interface Overlay {
  from: number
  to: number
  fg?: string
  bg?: string
  // Replaces the cell's attributes rather than adding to them, as a label drawn with setCell does.
  bold?: boolean
  char?: string
}

export type CaptureSpan = readonly [from: number, to: number, capture: string, ...rest: unknown[]]

export interface SegmentInput {
  spans?: readonly CaptureSpan[]
  words?: readonly WordSpan[]
  wordSide: "removed" | "added"
  baseFg: string
  rowBg: string
  search?: { matches: readonly { startCol: number; endCol: number; current: boolean }[] }
  selection?: { from: number; to: number }
  flash?: { matches: readonly { startCol: number; endCol: number; label?: string | null }[] } | null
  /** The cursor's column, drawn as a block over everything else. */
  cursor?: number
}

const specificity = (capture: string) => capture.split(".").length

// Mirrors the layers VimDiffView stacks through onHighlight and its post-process painters.
export function buildSegments(text: string, input: SegmentInput): Segment[] {
  const matches = [...(input.search?.matches ?? [])].sort((a, b) => Number(a.current) - Number(b.current))
  const overlays: Overlay[] = matches.map((match) => ({
    from: match.startCol,
    to: match.endCol,
    ...SYNTAX_PALETTE[match.current ? "search.current" : "search.match"],
  }))
  if (input.selection) overlays.push({ ...input.selection, bg: theme.surface1 })

  let cells = text.length
  for (const overlay of overlays) cells = Math.max(cells, overlay.to)
  // Past the end of the line, as on an empty one, the block still needs a cell to sit in.
  if (input.cursor !== undefined) cells = Math.max(cells, input.cursor + 1)

  const fg = new Array<string>(cells).fill(input.baseFg)
  const bg = new Array<string | undefined>(cells).fill(undefined)
  const attributes = new Uint8Array(cells)
  const glyphs: (string | undefined)[] = []

  const paint = (overlay: Overlay) => {
    const to = Math.min(overlay.to, cells)
    for (let i = Math.max(overlay.from, 0); i < to; i++) {
      if (overlay.fg) fg[i] = overlay.fg
      if (overlay.bg) bg[i] = overlay.bg
      if (overlay.bold !== undefined) attributes[i] = overlay.bold ? TextAttributes.BOLD : 0
      if (overlay.char !== undefined) glyphs[i] = text[i] === "\t" ? overlay.char.padEnd(TAB.length) : overlay.char
    }
  }

  // OpenTUI applies overlapping captures least specific first, then in the order they came.
  const spans = input.spans ?? []
  const ranks = spans.map((span) => specificity(span[2]))
  const order = [...spans.keys()].sort((a, b) => ranks[a]! - ranks[b]! || a - b)
  for (const index of order) {
    const [from, to, capture] = spans[index]!
    const style = styleOfCapture(capture)
    if (!style) continue
    paint({ from, to, fg: style.fg, bg: style.bg })
    if (style.bold === undefined && style.italic === undefined && style.underline === undefined) continue
    const end = Math.min(to, cells)
    for (let i = from; i < end; i++) {
      let flags = withFlag(attributes[i]!, TextAttributes.BOLD, style.bold)
      flags = withFlag(flags, TextAttributes.ITALIC, style.italic)
      attributes[i] = withFlag(flags, TextAttributes.UNDERLINE, style.underline)
    }
  }

  const wordBg = SYNTAX_PALETTE[`diff.word.${input.wordSide}`]!.bg
  for (const word of input.words ?? []) paint({ from: word.startCol, to: word.endCol, bg: wordBg })

  for (const overlay of overlays) paint(overlay)

  if (input.flash) {
    for (let i = 0; i < cells; i++) fg[i] = fade(fg[i]!, bg[i] ?? input.rowBg)
    for (const match of input.flash.matches) {
      paint({ from: match.startCol, to: match.endCol, fg: theme.text, bg: theme.surface1 })
      // On the match's first character, where the cursor lands, not one past it as flash.nvim does.
      if (match.label) {
        paint({ from: match.startCol, to: match.startCol + 1, fg: theme.base, bg: theme.red, bold: true, char: match.label })
      }
    }
  }

  if (input.cursor !== undefined) {
    paint({ from: input.cursor, to: input.cursor + 1, fg: theme.base, bg: theme.rosewater })
  }

  const segments: Segment[] = []
  let last: Segment | undefined
  for (let i = 0; i < cells; i++) {
    const code = text.charCodeAt(i)
    const astral = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length
    const char = glyphs[i] ?? (i >= text.length ? " " : astral ? text.slice(i, i + 2) : text[i]!)
    if (last && last.fg === fg[i] && last.bg === bg[i] && last.attributes === attributes[i]) {
      last.text += char
    } else {
      last = { text: char, fg: fg[i]!, attributes: attributes[i]! }
      if (bg[i]) last.bg = bg[i]
      segments.push(last)
    }
    if (astral) i++
  }
  // After the merge, so the overlay columns above stay the raw ones the cursor counts in.
  for (const segment of segments) {
    if (segment.text.includes("\t")) segment.text = segment.text.replaceAll("\t", TAB)
  }
  return segments
}

function withFlag(attributes: number, flag: number, on: boolean | undefined): number {
  if (on === undefined) return attributes
  return on ? attributes | flag : attributes & ~flag
}

// The same arithmetic dimCells runs on the frame buffer, whose channels truncate on write.
const faded = new Map<string, string>()
export function fade(fg: string, bg: string): string {
  const key = fg + bg
  const cached = faded.get(key)
  if (cached) return cached
  let hex = "#"
  for (let at = 1; at < 7; at += 2) {
    const from = parseInt(fg.slice(at, at + 2), 16)
    const to = parseInt(bg.slice(at, at + 2), 16)
    hex += Math.trunc(from + (to - from) * FLASH_BACKDROP_STRENGTH).toString(16).padStart(2, "0")
  }
  faded.set(key, hex)
  return hex
}

const SURROGATE = /[\ud800-\udbff]/

// Cut by code point: half a surrogate pair draws as a replacement glyph. Tabs are spaces by
// now, so half of one is a space, as a terminal scrolled into it shows.
export function sliceSegments(segments: readonly Segment[], fromCell: number, width: number): Segment[] {
  const sliced: Segment[] = []
  const end = fromCell + width
  let at = 0
  for (const segment of segments) {
    if (at >= end) break
    const points = SURROGATE.test(segment.text) ? Array.from(segment.text) : null
    const length = points ? points.length : segment.text.length
    const from = Math.max(fromCell - at, 0)
    const to = Math.min(end - at, length)
    if (from < to) {
      const text = points ? points.slice(from, to).join("") : segment.text.slice(from, to)
      sliced.push({ ...segment, text })
    }
    at += length
  }
  return sliced
}
