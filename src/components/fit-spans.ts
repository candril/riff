import { graphemeCells } from "../diff-rows/cells"

/** A run of a header line in one colour. */
export interface SummarySpan {
  text: string
  fg: string
}

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

/** In the cells the renderer lays the spans into, the same ones fitSpans cuts by. */
export function spansWidth(spans: readonly SummarySpan[]): number {
  let width = 0
  for (const span of spans) {
    for (const { segment } of graphemes.segment(span.text)) width += graphemeCells(segment)
  }
  return width
}

/**
 * The spans cut to `width` cells, `…` in the last cell when anything is cut,
 * drawn in the colour of the span it cuts. OpenTUI's own `truncate` elides
 * the middle with `...`, which would cut the answer out of a header.
 */
export function fitSpans(spans: readonly SummarySpan[], width: number): SummarySpan[] {
  if (spansWidth(spans) <= width) return [...spans]
  if (width <= 0) return []
  const fitted: SummarySpan[] = []
  let left = width - 1
  for (const span of spans) {
    let taken = ""
    let cut = false
    for (const { segment } of graphemes.segment(span.text)) {
      const cells = graphemeCells(segment)
      if (cells > left) {
        cut = true
        break
      }
      taken += segment
      left -= cells
    }
    if (cut) {
      fitted.push({ text: `${taken}…`, fg: span.fg })
      return fitted
    }
    fitted.push(span)
  }
  return fitted
}
