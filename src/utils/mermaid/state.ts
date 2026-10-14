/**
 * Draw a state diagram in character cells (spec 058).
 *
 * States stand in one column, in the order the transitions reach them, and
 * every transition is a line of its own: the next state down is reached
 * straight down the middle, any further one by a lane out to the right, and
 * one back up by a lane out to the left. A line leaves and arrives on a row
 * no other line uses, so lines never join, and where two cross it is only
 * ever a crossing. Labels stand in a column beyond the lanes, on the row
 * their line leaves its state.
 */

import type { FlowEdge, FlowNode, StateDiagram } from "./types"
import { Grid, UP, DOWN, LEFT, RIGHT } from "./grid"
import { assignLayers, drawBox, mergeParallelLinks } from "./flowchart"

/** Rows between two states: the line out of one and the arrowhead into the next. */
const GAP = 2
/** Columns from one lane to the next. */
const LANE = 2

type Side = "left" | "right"

interface Box {
  node: FlowNode
  x: number
  y: number
  width: number
  height: number
}

interface Route {
  edge: FlowEdge
  from: number
  to: number
  side: Side
  /** 0 is the lane nearest the states. */
  lane: number
  outRow: number
  inRow: number
}

interface Port {
  route: Route
  role: "out" | "in"
}

export function renderState(source: StateDiagram): string[] {
  if (source.nodes.length === 0) return []
  const diagram = mergeParallelLinks(source)
  const order = orderStates(diagram)
  const index = new Map(order.map((node, i) => [node.id, i]))

  // The next state down is reached down the middle; everything else by a
  // lane, on the right going down and on the left coming back up.
  const centre = new Map<number, FlowEdge>()
  const routes: Route[] = []
  for (const edge of diagram.edges) {
    const from = index.get(edge.from)
    const to = index.get(edge.to)
    if (from === undefined || to === undefined) continue
    if (to === from + 1) centre.set(from, edge)
    else routes.push({ edge, from, to, side: to >= from ? "right" : "left", lane: 0, outRow: 0, inRow: 0 })
  }
  const left = routes.filter((route) => route.side === "left")
  const right = routes.filter((route) => route.side === "right")
  const leftLanes = assignLanes(left)
  const rightLanes = assignLanes(right)

  const leftPorts = order.map((_, k) => leftPortsOf(k, left))
  const rightPorts = order.map((_, k) => rightPortsOf(k, right))

  // Across: labels, lanes, the states, lanes, labels.
  const widths = order.map(boxWidth)
  const columnWidth = Math.max(...widths)
  const leftLabels = Math.max(0, ...left.map((route) => route.edge.label?.length ?? 0))
  const leftOuter = leftLabels > 0 ? leftLabels + 2 : 0
  const columnLeft = leftLanes > 0 ? leftOuter + (leftLanes - 1) * LANE + 2 : 0
  const columnRight = columnLeft + columnWidth - 1
  const cx = columnLeft + Math.floor(columnWidth / 2)
  const rightInner = columnRight + 2
  const rightLabelX = rightInner + Math.max(0, rightLanes - 1) * LANE + 2
  const laneX = (route: Route): number =>
    route.side === "right" ? rightInner + route.lane * LANE : columnLeft - 2 - route.lane * LANE

  // Down: a state is as tall as its label or the lines on its busier side.
  const boxes: Box[] = []
  let y = 0
  order.forEach((node, k) => {
    const interior = Math.max(node.label.length, leftPorts[k]!.length, rightPorts[k]!.length)
    const width = widths[k]!
    boxes.push({ node, x: cx - Math.floor(width / 2), y, width, height: interior + 2 })
    y += interior + 2 + GAP
  })
  boxes.forEach((box, k) => {
    leftPorts[k]!.forEach((port, i) => setRow(port, box.y + 1 + i))
    rightPorts[k]!.forEach((port, i) => setRow(port, box.y + 1 + i))
  })

  const grid = new Grid()
  for (const box of boxes) {
    // The label sits in the middle of a box the lines made taller.
    const pad = Math.floor((box.height - 2 - box.node.label.length) / 2)
    const node = { ...box.node, label: [...Array<string>(pad).fill(""), ...box.node.label] }
    drawBox(grid, box.x, box.y, box.width, box.height, node)
  }

  for (const [k, edge] of centre) {
    const box = boxes[k]!
    const row = box.y + box.height
    grid.connect(cx, row, UP | DOWN)
    grid.put(cx, row + GAP - 1, "▼")
    if (!edge.label) continue
    // Beside the line when it fits before the first lane, else out with the
    // other labels.
    const beside = cx + 2
    const fits = rightLanes === 0 || beside + edge.label.length < rightInner
    grid.text(fits ? beside : rightLabelX, row, edge.label)
  }

  for (const route of routes) {
    const from = boxes[route.from]!
    const to = boxes[route.to]!
    const x = laneX(route)
    if (route.side === "right") {
      for (let i = from.x + from.width; i < x; i++) grid.connect(i, route.outRow, LEFT | RIGHT)
      grid.connect(x, route.outRow, LEFT | DOWN)
      for (let row = route.outRow + 1; row < route.inRow; row++) grid.connect(x, row, UP | DOWN)
      grid.connect(x, route.inRow, UP | LEFT)
      for (let i = to.x + to.width + 1; i < x; i++) grid.connect(i, route.inRow, LEFT | RIGHT)
      grid.put(to.x + to.width, route.inRow, "◀")
      if (route.edge.label) grid.text(rightLabelX, route.outRow, route.edge.label)
    } else {
      for (let i = x + 1; i < from.x; i++) grid.connect(i, route.outRow, LEFT | RIGHT)
      grid.connect(x, route.outRow, RIGHT | UP)
      for (let row = route.inRow + 1; row < route.outRow; row++) grid.connect(x, row, UP | DOWN)
      grid.connect(x, route.inRow, DOWN | RIGHT)
      for (let i = x + 1; i < to.x - 1; i++) grid.connect(i, route.inRow, LEFT | RIGHT)
      grid.put(to.x - 1, route.inRow, "▶")
      if (route.edge.label) grid.text(leftLabels - route.edge.label.length, route.outRow, route.edge.label)
    }
  }

  return grid.toLines()
}

/** Top to bottom by how far from the start a state is, then as declared. */
function orderStates(diagram: StateDiagram): FlowNode[] {
  const layers = assignLayers(diagram)
  return diagram.nodes
    .map((node, declared) => ({ node, declared, layer: layers.get(node.id) ?? 0 }))
    .sort((a, b) => a.layer - b.layer || a.declared - b.declared)
    .map((entry) => entry.node)
}

function boxWidth(node: FlowNode): number {
  const text = Math.max(...node.label.map((line) => line.length))
  return text + (node.shape === "decision" ? 6 : 4)
}

function setRow(port: Port, row: number): void {
  if (port.role === "out") port.route.outRow = row
  else port.route.inRow = row
}

/**
 * Shorter transitions take the lanes nearer the states, and a lane is shared
 * by transitions whose states do not overlap. Returns the lane count.
 */
function assignLanes(routes: Route[]): number {
  const span = (route: Route) => Math.abs(route.to - route.from)
  const sorted = [...routes].sort((a, b) => span(a) - span(b) || a.from - b.from || a.to - b.to)
  const lanes: Route[][] = []
  for (const route of sorted) {
    const low = Math.min(route.from, route.to)
    const high = Math.max(route.from, route.to)
    let lane = lanes.findIndex((held) =>
      held.every((other) => {
        const otherLow = Math.min(other.from, other.to)
        const otherHigh = Math.max(other.from, other.to)
        return otherHigh <= low || high <= otherLow
      }),
    )
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane]!.push(route)
    route.lane = lane
  }
  return lanes.length
}

const byLane = (a: Route, b: Route) => a.lane - b.lane

/**
 * The rows a state's right side gives its lines, top to bottom: arrivals
 * from above, inner lane first; then each loop back to itself, out above
 * in; then departures downwards, outer lane first. In that order no line's
 * stub crosses a lane that turns on the same row, so lines never join.
 */
function rightPortsOf(k: number, right: Route[]): Port[] {
  const arrivals = right.filter((route) => route.to === k && route.from < k).sort(byLane)
  const loops = right.filter((route) => route.from === k && route.to === k).sort(byLane)
  const departures = right.filter((route) => route.from === k && route.to > k).sort(byLane).reverse()
  return [
    ...arrivals.map((route): Port => ({ route, role: "in" })),
    ...loops.flatMap((route): Port[] => [
      { route, role: "out" },
      { route, role: "in" },
    ]),
    ...departures.map((route): Port => ({ route, role: "out" })),
  ]
}

/** The left side, mirrored: departures upwards, inner first, then arrivals from below, outer first. */
function leftPortsOf(k: number, left: Route[]): Port[] {
  const departures = left.filter((route) => route.from === k).sort(byLane)
  const arrivals = left.filter((route) => route.to === k).sort(byLane).reverse()
  return [
    ...departures.map((route): Port => ({ route, role: "out" })),
    ...arrivals.map((route): Port => ({ route, role: "in" })),
  ]
}
