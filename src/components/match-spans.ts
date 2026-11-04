/** A run of a row's text, and whether the picker's query matched it. */
export interface MatchSpan {
  text: string
  matched: boolean
}

/**
 * `text` cut into runs at the matched characters. `positions` index the
 * text the query was matched against, which `text` starts `offset` into: a
 * row that draws only part of what was matched shows only that part's
 * characters, and one that draws the match after a prefix passes a negative
 * offset. `visible` stops matching short of the end, for text cut with `…`.
 */
export function matchSpans(
  text: string,
  positions: readonly number[] = [],
  offset = 0,
  visible = text.length
): MatchSpan[] {
  const hit = new Set<number>()
  for (const position of positions) {
    const i = position - offset
    if (i >= 0 && i < visible) hit.add(i)
  }

  const spans: MatchSpan[] = []
  for (let i = 0; i < text.length; i++) {
    const matched = hit.has(i)
    const last = spans[spans.length - 1]
    if (last && last.matched === matched) last.text += text[i]
    else spans.push({ text: text[i]!, matched })
  }
  return spans
}

/** The spans' text, as drawn. */
export const spansText = (spans: readonly MatchSpan[]) => spans.map((span) => span.text).join("")
