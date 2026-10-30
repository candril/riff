import type { DiffLine } from "../vim-diff/types"
import { pairLines } from "./pair-lines"

export type View = "unified" | "split"
export type Side = "left" | "right"

/** Indices are visual indices into the mapping's lines. */
export type Row =
  | { kind: "line"; key: string; index: number }
  | { kind: "pair"; key: string; left?: number; right?: number }

// A drawn diagram's rows all sit on its fence line, so the line alone cannot tell them apart.
const partOf = (line: DiffLine): string => (line.renderedPart === undefined ? "" : `.${line.renderedPart}`)

const prefixOf = (line: DiffLine | undefined): string =>
  line?.type === "deletion" ? "-" : line?.type === "addition" ? "+" : " "

/**
 * Built from the file and its line numbers, never the visual index, so a key
 * outlives expanding, folding and toggling. A folded fence row is a copy of
 * its opening fence line and so keeps that line's key: it stands where the
 * fence was, and an anchor on the fence lands on the fold.
 */
export function lineKey(lines: readonly DiffLine[], index: number): string {
  const line = lines[index]!
  const f = line.filename ?? ""
  switch (line.type) {
    case "file-header":
      return `${f}\0file`
    case "spacing":
      return `${f}\0spacing`
    case "divider":
      return `${f}\0div\0${line.dividerKey ?? ""}`
    case "hunk-header":
      return `${f}\0hunk\0${line.hunkKey ?? ""}`
    case "context":
      return `${f}\0c${line.oldLineNum ?? ""}:${line.newLineNum ?? ""}${partOf(line)}`
    case "addition":
      return `${f}\0+${line.newLineNum}`
    case "deletion":
      return `${f}\0-${line.oldLineNum}`
    case "no-newline":
      return `${f}\0nl${prefixOf(lines[index - 1])}`
  }
}

function pairKey(lines: readonly DiffLine[], left?: number, right?: number): string {
  if (left !== undefined && left === right) return lineKey(lines, left)
  const leftLine = left === undefined ? undefined : lines[left]
  const rightLine = right === undefined ? undefined : lines[right]
  const f = (leftLine ?? rightLine)?.filename ?? ""
  // A marker has no number of its own; "nl" keeps it apart from an empty half.
  const leftId = leftLine ? (leftLine.oldLineNum ?? "nl") : ""
  const rightId = rightLine ? `${rightLine.newLineNum ?? "nl"}${partOf(rightLine)}` : ""
  return `${f}\0p${leftId}:${rightId}`
}

export function buildRows(lines: readonly DiffLine[], view: View): Row[] {
  if (view === "unified") {
    return lines.map((_, index) => ({ kind: "line", key: lineKey(lines, index), index }))
  }
  return pairLines(lines).map((pair): Row =>
    "full" in pair
      ? { kind: "line", key: lineKey(lines, pair.full), index: pair.full }
      : { kind: "pair", key: pairKey(lines, pair.left, pair.right), ...pair },
  )
}

/** The line a row stands for, seen from one side; an empty half gives the other. */
export function lineOf(row: Row | undefined, side: Side): number | undefined {
  if (row?.kind === "line") return row.index
  if (row?.kind === "pair") {
    return side === "left" ? (row.left ?? row.right) : (row.right ?? row.left)
  }
  return undefined
}

/** Row index per visual line, -1 for a line no row shows. */
export function rowIndexByLine(rows: readonly Row[], lineCount: number): Int32Array {
  const byLine = new Int32Array(lineCount).fill(-1)
  rows.forEach((row, rowIndex) => {
    for (const index of halvesOf(row)) {
      if (index < lineCount) byLine[index] = rowIndex
    }
  })
  return byLine
}

export function halvesOf(row: Row): number[] {
  if (row.kind === "line") return [row.index]
  const halves: number[] = []
  if (row.left !== undefined) halves.push(row.left)
  if (row.right !== undefined && row.right !== row.left) halves.push(row.right)
  return halves
}
