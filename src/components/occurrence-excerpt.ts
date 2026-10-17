import type { Span } from "../features/occurrence-picker/filter"

/** A match further right than this is scrolled into view with a leading `…`. */
export const LEAD = 48

export type Mark = "plain" | "match" | "narrow"

export interface Segment {
  text: string
  mark: Mark
}

interface MarkedSpan {
  span: Span
  mark: Mark
}

export function narrowMarks(spans: readonly Span[]): MarkedSpan[] {
  return spans.map((span) => ({ span, mark: "narrow" }))
}

/**
 * The row's text around its first match, indentation dropped, cut into runs
 * by what is highlighted. A match far to the right is brought into view: the
 * list is narrower than the code. The search match is drawn over any
 * narrowing term it overlaps, since it is where the cursor lands.
 */
export function excerpt(text: string, match: Span, narrow: readonly Span[] = []): Segment[] {
  const [startCol] = match
  const indent = text.length - text.trimStart().length
  const lineStart = Math.min(indent, startCol)
  const clipped = startCol - lineStart > LEAD
  const segments = highlight(
    text,
    [...narrowMarks(narrow), { span: match, mark: "match" }],
    clipped ? startCol - LEAD + 1 : lineStart
  )
  return clipped ? [{ text: "…", mark: "plain" }, ...segments] : segments
}

/** Later spans are drawn over earlier ones. */
export function highlight(text: string, spans: readonly MarkedSpan[], from = 0): Segment[] {
  const marks: Mark[] = Array.from({ length: text.length }, () => "plain")
  for (const { span, mark } of spans) {
    for (let i = span[0]; i < span[1] && i < text.length; i++) marks[i] = mark
  }

  const segments: Segment[] = []
  for (let i = from; i < text.length; i++) {
    const last = segments[segments.length - 1]
    if (last && last.mark === marks[i]) last.text += text[i]
    else segments.push({ text: text[i]!, mark: marks[i]! })
  }
  return segments
}
