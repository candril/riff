import { expect } from "bun:test"
import { mountDiffView, type MountDiffViewOptions } from "./frame"
import { bgAt, fgAt } from "./split-frame"

export type Case = Omit<MountDiffViewOptions, "selectedFileIndex"> & { selectedFileIndex?: number }

export type At = [x: number, y: number]
export type Rgba = number[] | undefined

type Setup = Awaited<ReturnType<typeof mountDiffView>>["setup"]
type Spans = ReturnType<Setup["captureSpans"]>

/** A screen's glyphs, row by row and untrimmed so a cell is `rows[y][x]`, and the colours under them. */
export interface Screen {
  rows: string[]
  spans: Spans
}

export function screenOf(mounted: { setup: Pick<Setup, "captureCharFrame" | "captureSpans"> }): Screen {
  return { rows: mounted.setup.captureCharFrame().split("\n"), spans: mounted.setup.captureSpans() }
}

export const charAt = (screen: Screen, [x, y]: At) => screen.rows[y]![x]

export const rowCells = (ys: number[], width: number): At[] =>
  ys.flatMap((y) => Array.from({ length: width }, (_, x): At => [x, y]))

export const except = (cells: At[], ...masked: At[]) =>
  cells.filter(([x, y]) => !masked.some(([mx, my]) => mx === x && my === y))

export const sameRgba = (a: Rgba, b: Rgba) => JSON.stringify(a) === JSON.stringify(b)

/*
 * VimDiffView's drawMarker hands OpenTUI's 16-bit colour channels to
 * RGBA.fromValues, which takes 0..1, so its marker cells come out white.
 * What it means to keep is the background the cell already had, the one
 * the cell to its left still shows; the new view is held to that.
 */
export function expectSameColours(old: Screen, fresh: Screen, markers: At[], plain: At[]) {
  expect(markers.map((at) => [charAt(fresh, at), fgAt(fresh.spans, ...at), bgAt(fresh.spans, ...at)])).toEqual(
    markers.map(([x, y]) => [charAt(old, [x, y]), fgAt(old.spans, x, y), bgAt(old.spans, x - 1, y)])
  )
  expect(plain.map((at) => bgAt(fresh.spans, ...at))).toEqual(plain.map((at) => bgAt(old.spans, ...at)))
}
