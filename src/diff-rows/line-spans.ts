import type { SimpleHighlight } from "@opentui/core"
import { lineStarts } from "../vim-diff/file-highlights"
import { parseHighlights, type FileParses, type Parse } from "../vim-diff/file-parses"
import { getFiletypeFromPath } from "../vim-diff/filetype"
import { dropSplitKeywords } from "../vim-diff/split-keywords"
import type { DiffLine } from "../vim-diff/types"
import type { CaptureSpan } from "./segments"

export type TextSide = "old" | "new"

// A long review scrolls through far more hunks than it revisits.
export const FRAGMENT_SPAN_LIMIT = 256

const NO_SPANS: readonly CaptureSpan[] = []

const inRun = (line: DiffLine | undefined, filename: string) =>
  !!line &&
  (line.filename ?? "") === filename &&
  (line.type === "context" || line.type === "addition" || line.type === "deletion" || line.type === "no-newline")

// Context belongs to both texts; a split view draws it in both halves.
const onSide = (line: DiffLine, side: TextSide) =>
  line.type === "context" || line.type === (side === "new" ? "addition" : "deletion")

/** The half of a split view a line is drawn in, or undefined for a full-width row. */
export function sideOf(lines: readonly DiffLine[], index: number): TextSide | undefined {
  const line = lines[index]
  switch (line?.type) {
    case "deletion":
      return "old"
    case "context":
    case "addition":
      return "new"
    case "no-newline":
      // It describes the line above it, so it stays in that line's half.
      return lines[index - 1]?.type === "deletion" ? "old" : "new"
    default:
      return undefined
  }
}

/** Where a line's text sits in its run's text on one side. */
interface RunSlot {
  key: string
  text: string
  filename: string
  at: number
}

/**
 * Each diff line's capture spans in its own columns, for a view that draws
 * every line as its own box. The file's parse reads closest (spec 080); a
 * line riff has no file parse for is coloured from its hunk's side parsed as
 * one piece of code, which reads closer to the file than single lines would.
 */
export class LineSpans {
  /** Told when a fragment parse lands, so the frame can be drawn again. */
  onSpans: (() => void) | undefined

  private disposed = false
  private fileLines = new WeakMap<readonly SimpleHighlight[], Map<number, readonly CaptureSpan[]>>()
  private slots = new WeakMap<readonly DiffLine[], Record<TextSide, Map<number, RunSlot | null>>>()
  // Keyed by text, so a fold or an expansion that rebuilds the lines keeps the parse.
  private fragments = new Map<string, "pending" | readonly (readonly CaptureSpan[])[]>()

  constructor(
    private readonly parses: FileParses,
    private readonly parse: Parse = parseHighlights,
    private readonly limit = FRAGMENT_SPAN_LIMIT
  ) {}

  /** Undefined until the colours are known; asking is what starts the work. */
  spans(lines: readonly DiffLine[], index: number): readonly CaptureSpan[] | undefined {
    const line = lines[index]
    const side = sideOf(lines, index)
    if (!line || !side) return undefined
    if (line.type === "no-newline") return NO_SPANS

    const file = line.filename ? this.parses.get(line.filename)?.[side] : undefined
    if (file?.highlights) {
      const fileLine = side === "old" ? line.oldLineNum : line.newLineNum
      if (fileLine === undefined) return NO_SPANS
      return this.indexFile(file.highlights, file.content).get(fileLine) ?? NO_SPANS
    }

    const slot = this.slotOf(lines, index, side)
    if (!slot) return NO_SPANS
    const cached = this.fragments.get(slot.key)
    if (cached === "pending") return undefined
    if (cached) {
      this.fragments.delete(slot.key)
      this.fragments.set(slot.key, cached)
      return cached[slot.at] ?? NO_SPANS
    }

    const filetype = getFiletypeFromPath(slot.filename)
    if (!filetype) {
      this.store(slot.key, [])
      return NO_SPANS
    }
    this.store(slot.key, "pending")
    void this.parseFragment(slot.key, slot.text, filetype)
    return undefined
  }

  /** A parse landing once the renderer is gone would draw into freed native memory. */
  dispose(): void {
    this.disposed = true
  }

  // Once per parse, so a row's lookup stays constant however long the file is.
  private indexFile(highlights: readonly SimpleHighlight[], content: string): Map<number, readonly CaptureSpan[]> {
    const indexed = this.fileLines.get(highlights) ?? spansByLine(content, highlights)
    this.fileLines.set(highlights, indexed)
    return indexed
  }

  // A run's text is built once per lines array and handed to every line in it.
  private slotOf(lines: readonly DiffLine[], index: number, side: TextSide): RunSlot | null {
    const perLines = this.slots.get(lines) ?? { old: new Map(), new: new Map() }
    this.slots.set(lines, perLines)
    const slots = perLines[side]
    const known = slots.get(index)
    if (known !== undefined) return known

    const filename = lines[index]!.filename ?? ""
    let start = index
    while (start > 0 && inRun(lines[start - 1], filename)) start--
    let end = index
    while (inRun(lines[end + 1], filename)) end++

    const members: number[] = []
    let text = ""
    for (let i = start; i <= end; i++) {
      slots.set(i, null)
      if (!onSide(lines[i]!, side)) continue
      members.push(i)
      text += `${lines[i]!.content}\n`
    }
    const key = `${filename}\0${side}\0${text}`
    members.forEach((member, at) => slots.set(member, { key, text, filename, at }))
    return slots.get(index) ?? null
  }

  private async parseFragment(key: string, text: string, filetype: string): Promise<void> {
    const highlights = await this.parse(text, filetype).catch(() => null)
    if (this.disposed) return
    if (!highlights) {
      this.store(key, [])
    } else {
      const byLine = spansByLine(text, highlights)
      this.store(key, text.split("\n").slice(0, -1).map((_, at) => byLine.get(at + 1) ?? NO_SPANS))
    }
    this.onSpans?.()
  }

  private store(key: string, value: "pending" | readonly (readonly CaptureSpan[])[]): void {
    this.fragments.delete(key)
    this.fragments.set(key, value)
    while (this.fragments.size > this.limit) {
      const oldest = this.fragments.keys().next().value
      if (oldest === undefined) break
      this.fragments.delete(oldest)
    }
  }
}

/**
 * Each line's spans in its own columns, keyed by 1-based line. A highlight
 * spanning lines is cut at each, as mapFileHighlights cuts it: the rows a
 * split view draws are separate boxes, and a range across them means nothing.
 */
function spansByLine(content: string, highlights: readonly SimpleHighlight[]): Map<number, readonly CaptureSpan[]> {
  const starts = lineStarts(content)
  const lineEndOf = (line: number) => (starts[line + 1] ?? content.length + 1) - 1
  const byLine = new Map<number, SimpleHighlight[]>()
  for (const [start, end, capture] of highlights) {
    for (let line = lineAt(starts, start); line < starts.length && starts[line]! < end; line++) {
      const lineStart = starts[line]!
      const from = Math.max(0, start - lineStart)
      const to = Math.min(lineEndOf(line), end) - lineStart
      if (to <= from) continue
      const spans = byLine.get(line + 1) ?? []
      spans.push([from, to, capture])
      byLine.set(line + 1, spans)
    }
  }

  const result = new Map<number, readonly CaptureSpan[]>()
  for (const [line, spans] of byLine) {
    result.set(line, dropSplitKeywords(spans, content.slice(starts[line - 1]!, lineEndOf(line - 1))))
  }
  return result
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (starts[mid]! <= offset) low = mid
    else high = mid - 1
  }
  return low
}
