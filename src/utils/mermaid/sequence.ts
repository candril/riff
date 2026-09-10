/**
 * Draw a sequence diagram in character cells (spec 058).
 *
 * Easier than a flowchart, and a different problem: participants are columns
 * fixed in the order they are introduced, and time runs down the page, so
 * there is nothing to lay out — only to space.
 */

import type { SequenceDiagram, SequenceEvent } from "./types"
import { Grid, UP, DOWN, LEFT, RIGHT } from "./grid"

/** Room either side of a message's text before it touches a lifeline. */
const LABEL_PADDING = 4
const MIN_GAP = 6

export function renderSequence(diagram: SequenceDiagram): string[] {
  if (diagram.participants.length === 0) return []

  const columns = position(diagram)
  const grid = new Grid()

  const boxHeight = 3
  for (const [index, participant] of diagram.participants.entries()) {
    const width = participant.label.length + 4
    drawBox(grid, columns[index]! - Math.floor(width / 2), 0, width, participant.label)
  }

  let row = boxHeight
  const drawn: (() => void)[] = []

  for (const event of diagram.events) {
    row += 1
    if (event.kind === "message") {
      const self = event.from === event.to
      const at = row
      drawn.push(() => drawMessage(grid, columns, diagram, event, at))
      row += self ? 3 : 2
      continue
    }
    if (event.kind === "note") {
      const at = row
      drawn.push(() => drawNote(grid, columns, diagram, event, at))
      row += 3
      continue
    }
    const at = row
    drawn.push(() => drawBlock(grid, columns, event.label, at))
    row += 1
  }

  // Lifelines first, so everything drawn on top of them wins the cell.
  const bottom = row
  for (const column of columns) {
    for (let y = boxHeight; y < bottom; y++) grid.connect(column, y, UP | DOWN)
  }
  for (const draw of drawn) draw()

  return grid.toLines()
}

/**
 * Where each lifeline runs. A gap has to hold the widest message written
 * across it, or the text would run into the next participant.
 */
function position(diagram: SequenceDiagram): number[] {
  const index = new Map(diagram.participants.map((participant, i) => [participant.id, i]))
  const half = diagram.participants.map((participant) =>
    Math.ceil((participant.label.length + 4) / 2),
  )

  const gaps = diagram.participants.map((_, i) => (i === 0 ? 0 : half[i - 1]! + half[i]! + MIN_GAP))

  for (const event of diagram.events) {
    if (event.kind !== "message") continue
    const from = index.get(event.from)
    const to = index.get(event.to)
    if (from === undefined || to === undefined) continue

    const first = Math.min(from, to)
    const last = Math.max(from, to)
    const spans = Math.max(1, last - first)
    const needed = Math.ceil((event.label.length + LABEL_PADDING) / spans)

    for (let i = first + 1; i <= last; i++) {
      gaps[i] = Math.max(gaps[i]!, needed)
    }
    // A message to oneself loops out to the right of its own lifeline.
    if (first === last && first + 1 < gaps.length) {
      gaps[first + 1] = Math.max(gaps[first + 1]!, event.label.length + LABEL_PADDING + 2)
    }
  }

  const columns: number[] = []
  let x = half[0]!
  for (let i = 0; i < diagram.participants.length; i++) {
    x += gaps[i]!
    columns.push(x)
  }
  return columns
}

function drawBox(grid: Grid, x: number, y: number, width: number, label: string): void {
  grid.put(x, y, "┌")
  grid.put(x + width - 1, y, "┐")
  grid.put(x, y + 2, "└")
  grid.put(x + width - 1, y + 2, "┘")
  for (let i = x + 1; i < x + width - 1; i++) {
    grid.put(i, y, "─")
    grid.put(i, y + 2, "─")
  }
  grid.put(x, y + 1, "│")
  grid.put(x + width - 1, y + 1, "│")
  for (let i = x + 1; i < x + width - 1; i++) grid.put(i, y + 1, " ")
  grid.text(x + 2, y + 1, label)
}

function drawMessage(
  grid: Grid,
  columns: number[],
  diagram: SequenceDiagram,
  event: Extract<SequenceEvent, { kind: "message" }>,
  row: number,
): void {
  const from = columns[diagram.participants.findIndex((p) => p.id === event.from)]
  const to = columns[diagram.participants.findIndex((p) => p.id === event.to)]
  if (from === undefined || to === undefined) return

  const dotted = event.style === "dotted"
  const rightwards = to > from

  if (from === to) {
    // A call to oneself: out, down and back into the same lifeline.
    const reach = from + Math.max(4, event.label.length + 2)
    grid.text(from + 2, row, event.label)
    for (let x = from + 1; x < reach; x++) grid.connect(x, row + 1, LEFT | RIGHT)
    grid.connect(from, row + 1, UP | DOWN | RIGHT)
    grid.connect(reach, row + 1, LEFT | DOWN)
    grid.connect(reach, row + 2, UP | LEFT)
    for (let x = from + 2; x < reach; x++) grid.connect(x, row + 2, LEFT | RIGHT)
    grid.put(from + 1, row + 2, head(event.arrow, false))
    grid.connect(from, row + 2, UP | DOWN | RIGHT)
    return
  }

  const left = Math.min(from, to)
  const right = Math.max(from, to)
  const label = event.label.slice(0, right - left - 2)
  grid.text(left + Math.max(1, Math.floor((right - left - label.length) / 2)), row, label)

  // The head stops one short of the target so its lifeline stays unbroken.
  const tip = rightwards ? to - 1 : to + 1
  for (let x = left + 1; x < right; x++) {
    if (x === tip) continue
    if (dotted) grid.put(x, row + 1, "╌")
    else grid.connect(x, row + 1, LEFT | RIGHT)
  }
  grid.connect(from, row + 1, UP | DOWN | (rightwards ? RIGHT : LEFT))
  grid.put(tip, row + 1, head(event.arrow, rightwards))
  grid.connect(to, row + 1, UP | DOWN | (rightwards ? LEFT : RIGHT))
}

function drawNote(
  grid: Grid,
  columns: number[],
  diagram: SequenceDiagram,
  event: Extract<SequenceEvent, { kind: "note" }>,
  row: number,
): void {
  const covered = event.over
    .map((id) => columns[diagram.participants.findIndex((p) => p.id === id)])
    .filter((column): column is number => column !== undefined)
  if (covered.length === 0) return

  const centre = Math.round((Math.min(...covered) + Math.max(...covered)) / 2)
  const width = event.label.length + 4
  drawBox(grid, Math.max(0, centre - Math.floor(width / 2)), row, width, event.label)
}

function head(arrow: "head" | "open" | "cross", rightwards: boolean): string {
  if (arrow === "cross") return "✗"
  return rightwards ? "▶" : "◀"
}

/** `loop`, `alt`, `end` — a rule across the diagram carrying its word. */
function drawBlock(grid: Grid, columns: number[], label: string, row: number): void {
  const left = Math.max(0, (columns[0] ?? 0) - 2)
  // Long enough for the word it carries, however wide the diagram is.
  const right = Math.max((columns[columns.length - 1] ?? 0) + 2, left + label.length + 4)

  for (let x = left; x <= right; x++) grid.put(x, row, "╌")
  grid.put(left + 1, row, " ")
  grid.text(left + 2, row, label)
  grid.put(left + 2 + label.length, row, " ")
}
