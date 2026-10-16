import type { TestRendererSetup } from "@opentui/core/testing"

export type At = [x: number, y: number]

type Spans = ReturnType<TestRendererSetup["captureSpans"]>

/** A screen's glyphs, row by row and untrimmed so a cell is `rows[y][x]`, and the colours under them. */
export interface Screen {
  rows: string[]
  spans: Spans
}

export function screenOf(mounted: { setup: Pick<TestRendererSetup, "captureCharFrame" | "captureSpans"> }): Screen {
  return { rows: mounted.setup.captureCharFrame().split("\n"), spans: mounted.setup.captureSpans() }
}

export const charAt = (screen: Screen, [x, y]: At) => screen.rows[y]![x]

/**
 * A trimmed frame split at the scrollbar's column: the bar's cells top to
 * bottom, and each row short of it, so the code and the thumb read apart.
 */
export function splitAtBar(frame: string, width: number) {
  const rows = frame.split("\n")
  return {
    body: rows.map((row) => row.slice(0, width - 1).trimEnd()),
    bar: rows.map((row) => row[width - 1] ?? " ").join(""),
  }
}
