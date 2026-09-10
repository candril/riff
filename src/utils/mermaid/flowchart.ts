/**
 * Draw a flowchart in character cells (spec 058).
 *
 * A layered layout, the way graphviz and mermaid both do it: nodes get a
 * layer from the longest path to them, edges that skip layers get invisible
 * stand-ins so every edge spans exactly one band, and a couple of averaging
 * sweeps put each node near its neighbours to keep the lines short.
 */

import type { FlowchartDiagram, FlowEdge, FlowNode } from "./types"
import { Grid, UP, DOWN, LEFT, RIGHT } from "./grid"

/** Space between two boxes in the same layer. */
const GAP = 2
/** Rows (or columns) between one layer and the next, before labels.
 *  Three, so that a link's turn, its run into the target and its arrowhead
 *  each get a cell of their own. */
const BAND = 3

interface Placed {
  id: string
  node: FlowNode | null
  layer: number
  /** Along the flow — rows for TD, columns for LR. */
  main: number
  mainSize: number
  /** Across the flow. */
  cross: number
  crossSize: number
}

interface Link {
  from: string
  to: string
  edge: FlowEdge
  /** True for the segment that carries the arrowhead. */
  last: boolean
  label?: string
}

export function renderFlowchart(diagram: FlowchartDiagram): string[] {
  if (diagram.nodes.length === 0) return []

  const horizontal = diagram.direction === "LR" || diagram.direction === "RL"
  const reversed = diagram.direction === "BT" || diagram.direction === "RL"

  const layers = assignLayers(diagram)
  const { placed, links } = expand(diagram, layers)

  measure(placed, horizontal)
  layout(placed, links, horizontal, reversed)

  return draw(placed, links, horizontal)
}

/**
 * Longest-path layering, with cycles broken at the edge that closes them —
 * a diagram with a loop in it still has to be drawn somewhere.
 */
function assignLayers(diagram: FlowchartDiagram): Map<string, number> {
  const forward = new Map<string, string[]>()
  const incoming = new Map<string, number>()
  for (const node of diagram.nodes) {
    forward.set(node.id, [])
    incoming.set(node.id, 0)
  }

  const backEdges = findBackEdges(diagram)
  for (const edge of diagram.edges) {
    if (backEdges.has(edge) || edge.from === edge.to) continue
    forward.get(edge.from)?.push(edge.to)
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1)
  }

  const layer = new Map<string, number>()
  const queue = diagram.nodes.filter((node) => (incoming.get(node.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) layer.set(id, 0)

  while (queue.length > 0) {
    const id = queue.shift()!
    for (const next of forward.get(id) ?? []) {
      layer.set(next, Math.max(layer.get(next) ?? 0, (layer.get(id) ?? 0) + 1))
      const left = (incoming.get(next) ?? 0) - 1
      incoming.set(next, left)
      if (left === 0) queue.push(next)
    }
  }

  // Anything still unplaced sat in a cycle every entry point of which was
  // itself in the cycle; put it at the start rather than nowhere.
  for (const node of diagram.nodes) {
    if (!layer.has(node.id)) layer.set(node.id, 0)
  }
  return layer
}

function findBackEdges(diagram: FlowchartDiagram): Set<FlowEdge> {
  const out = new Map<string, FlowEdge[]>()
  for (const edge of diagram.edges) {
    const list = out.get(edge.from)
    if (list) list.push(edge)
    else out.set(edge.from, [edge])
  }

  const back = new Set<FlowEdge>()
  const state = new Map<string, "open" | "done">()

  const visit = (id: string): void => {
    state.set(id, "open")
    for (const edge of out.get(id) ?? []) {
      const seen = state.get(edge.to)
      if (seen === "open") back.add(edge)
      else if (seen === undefined) visit(edge.to)
    }
    state.set(id, "done")
  }

  for (const node of diagram.nodes) {
    if (!state.has(node.id)) visit(node.id)
  }
  return back
}

/**
 * Every edge reduced to single-layer hops, with a stand-in node holding the
 * place of a long edge in each layer it passes through — the trick that lets
 * one elbow routine draw every link.
 */
function expand(
  diagram: FlowchartDiagram,
  layers: Map<string, number>,
): { placed: Placed[]; links: Link[] } {
  const placed: Placed[] = diagram.nodes.map((node) => ({
    id: node.id,
    node,
    layer: layers.get(node.id) ?? 0,
    main: 0,
    mainSize: 0,
    cross: 0,
    crossSize: 0,
  }))

  const links: Link[] = []
  let dummies = 0

  for (const edge of diagram.edges) {
    const from = layers.get(edge.from) ?? 0
    const to = layers.get(edge.to) ?? 0
    const span = to - from

    // Only forward edges get stand-ins: one running backwards is drawn round
    // the outside in a single sweep, so it passes through no layer at all.
    if (span <= 1) {
      links.push({ from: edge.from, to: edge.to, edge, last: true, label: edge.label })
      continue
    }

    let previous = edge.from
    for (let i = 1; i < span; i++) {
      const id = ` dummy${dummies++}`
      placed.push({
        id,
        node: null,
        layer: from + i,
        main: 0,
        mainSize: 1,
        cross: 0,
        crossSize: 1,
      })
      links.push({
        from: previous,
        to: id,
        edge,
        last: false,
        label: i === 1 ? edge.label : undefined,
      })
      previous = id
    }
    links.push({ from: previous, to: edge.to, edge, last: true })
  }

  return { placed, links }
}

function measure(placed: Placed[], horizontal: boolean): void {
  for (const item of placed) {
    if (!item.node) continue

    const text = Math.max(...item.node.label.map((line) => line.length))
    const decision = item.node.shape === "decision"
    const width = text + (decision ? 6 : 4)
    const height = item.node.label.length + 2

    item.mainSize = horizontal ? width : height
    item.crossSize = horizontal ? height : width
  }
}

/**
 * Positions along both axes: layers stack along the main axis, and a few
 * averaging sweeps settle each node across it.
 */
function layout(placed: Placed[], links: Link[], horizontal: boolean, reversed: boolean): void {
  const byLayer = new Map<number, Placed[]>()
  for (const item of placed) {
    const list = byLayer.get(item.layer)
    if (list) list.push(item)
    else byLayer.set(item.layer, [item])
  }
  const order = [...byLayer.keys()].sort((a, b) => a - b)

  // Cross axis: start packed, then pull each node towards its neighbours.
  for (const layer of order) pack(byLayer.get(layer)!, null)

  const neighbours = neighbourIndex(links)
  const byId = new Map(placed.map((item) => [item.id, item]))
  for (let sweep = 0; sweep < 4; sweep++) {
    const downwards = sweep % 2 === 0
    const sequence = downwards ? order : [...order].reverse()
    for (const layer of sequence) {
      const items = byLayer.get(layer)!
      const centres = new Map<string, number>()
      for (const item of items) {
        const around = (downwards ? neighbours.before : neighbours.after).get(item.id) ?? []
        const known = around
          .map((id) => byId.get(id))
          .filter((candidate): candidate is Placed => candidate !== undefined)
        if (known.length === 0) continue
        // The same integer centre the link is drawn from, or a box would be
        // aligned half a cell off and get an elbow it does not need.
        centres.set(item.id, known.reduce((sum, other) => sum + centre(other), 0) / known.length)
      }
      if (centres.size > 0) pack(items, centres)
    }
  }

  const leftmost = Math.min(...placed.map((item) => item.cross))
  for (const item of placed) item.cross -= leftmost

  // Main axis: one layer after another, with room between for the elbows,
  // any label they carry, and a lane for links running against the flow.
  const sequence = reversed ? [...order].reverse() : order
  let main = 0
  for (let i = 0; i < sequence.length; i++) {
    const layer = sequence[i]!
    const items = byLayer.get(layer)!
    const size = Math.max(...items.map((item) => item.mainSize))
    for (const item of items) item.main = main

    const next = sequence[i + 1]
    main += size + (next === undefined ? 0 : bandSize(links, byId, Math.min(layer, next), horizontal))
  }
}

/**
 * How much room the run between two layers needs: one cell to leave the
 * source, one to turn in, one to arrive; a row for labels, and another lane
 * when something also runs the other way through the same gap.
 */
function centre(item: Placed | undefined): number {
  return item === undefined ? NaN : item.cross + Math.floor(item.crossSize / 2)
}

function bandSize(
  links: Link[],
  byId: Map<string, Placed>,
  layer: number,
  horizontal: boolean,
): number {
  const crossing = links.filter((link) => {
    const from = byId.get(link.from)
    const to = byId.get(link.to)
    return from && to && Math.min(from.layer, to.layer) === layer
  })

  const labels = crossing.filter((link) => link.label).map((link) => link.label!.length)
  const backwards = crossing.some(
    (link) => (byId.get(link.from)?.layer ?? 0) > (byId.get(link.to)?.layer ?? 0),
  )

  // Nothing has to turn here, so the run needs no room to turn in: one cell
  // to leave the source and one for the arrowhead.
  const straight = crossing.every((link) => centre(byId.get(link.from)) === centre(byId.get(link.to)))
  if (straight && labels.length === 0 && !backwards) return 2

  const forLabels = horizontal
    ? labels.length > 0
      ? Math.max(...labels) + 2
      : 0
    : labels.length > 0
      ? 1
      : 0

  return Math.max(BAND, horizontal ? forLabels : BAND + forLabels) + (backwards ? 1 : 0)
}

/**
 * Lay a layer out across the flow: keep the requested centres where they fit,
 * and push right when they don't.
 */
function pack(items: Placed[], centres: Map<string, number> | null): void {
  if (centres) {
    items.sort((a, b) => (centres.get(a.id) ?? centre(a)) - (centres.get(b.id) ?? centre(b)))
  }

  let edge = 0
  for (const item of items) {
    const wanted = centres?.get(item.id)
    const start =
      wanted === undefined
        ? edge
        : Math.max(edge, Math.round(wanted) - Math.floor(item.crossSize / 2))
    item.cross = start
    edge = start + item.crossSize + GAP
  }
}

function neighbourIndex(links: Link[]): {
  before: Map<string, string[]>
  after: Map<string, string[]>
} {
  const before = new Map<string, string[]>()
  const after = new Map<string, string[]>()
  for (const link of links) {
    const to = before.get(link.to)
    if (to) to.push(link.from)
    else before.set(link.to, [link.from])

    const from = after.get(link.from)
    if (from) from.push(link.to)
    else after.set(link.from, [link.to])
  }
  return { before, after }
}

function draw(placed: Placed[], links: Link[], horizontal: boolean): string[] {
  const grid = new Grid()
  const at = (main: number, cross: number): [number, number] =>
    horizontal ? [main, cross] : [cross, main]

  for (const item of placed) {
    if (!item.node) continue
    const [x, y] = at(item.main, item.cross)
    drawBox(
      grid,
      x,
      y,
      horizontal ? item.mainSize : item.crossSize,
      horizontal ? item.crossSize : item.mainSize,
      item.node,
    )
  }

  const byId = new Map(placed.map((item) => [item.id, item]))
  const lane = Math.max(...placed.map((item) => item.cross + item.crossSize)) + 1

  for (const link of links) {
    const from = byId.get(link.from)
    const to = byId.get(link.to)
    if (!from || !to) continue
    // A link running against the flow would otherwise meet the forward ones
    // head-on; it goes round the outside instead. Read from the layers, not
    // the coordinates: `BT` draws the first layer at the bottom, and every
    // link in it runs up the page without running against anything.
    if (to.layer < from.layer) drawDetour(grid, from, to, link, horizontal, at, lane)
    else drawLink(grid, from, to, link, horizontal, at)
  }

  return grid.toLines()
}

function drawBox(
  grid: Grid,
  x: number,
  y: number,
  width: number,
  height: number,
  node: FlowNode,
): void {
  const round = node.shape === "round" || node.shape === "stadium" || node.shape === "circle"
  const decision = node.shape === "decision"
  const corners = round
    ? ["╭", "╮", "╰", "╯"]
    : decision
      ? ["╱", "╲", "╲", "╱"]
      : ["┌", "┐", "└", "┘"]

  // A decision leans its corners in, so its top and bottom rules are shorter.
  const inset = decision ? 1 : 0

  grid.put(x + inset, y, corners[0]!)
  grid.put(x + width - 1 - inset, y, corners[1]!)
  grid.put(x + inset, y + height - 1, corners[2]!)
  grid.put(x + width - 1 - inset, y + height - 1, corners[3]!)
  for (let i = x + inset + 1; i < x + width - 1 - inset; i++) {
    grid.put(i, y, "─")
    grid.put(i, y + height - 1, "─")
  }

  for (let row = 1; row < height - 1; row++) {
    grid.put(x, y + row, "│")
    grid.put(x + width - 1, y + row, "│")
    for (let i = x + 1; i < x + width - 1; i++) grid.put(i, y + row, " ")

    const label = node.label[row - 1] ?? ""
    const room = width - 2
    const left = x + 1 + Math.max(0, Math.floor((room - label.length) / 2))
    grid.text(left, y + row, label.slice(0, room))
  }
}

function drawLink(
  grid: Grid,
  from: Placed,
  to: Placed,
  link: Link,
  horizontal: boolean,
  at: (main: number, cross: number) => [number, number],
): void {
  const forward = to.main >= from.main
  const startMain = forward ? from.main + from.mainSize : from.main - 1
  const endMain = forward ? to.main - 1 : to.main + to.mainSize
  // Turn as soon as the source is clear. Links running the other way through
  // the same gap turn a cell later, in the lane the band left for them.
  const step = forward ? 1 : -1
  const turn = clampBetween(startMain + step, startMain, endMain)

  const fromCross = from.cross + Math.floor(from.crossSize / 2)
  const toCross = to.cross + Math.floor(to.crossSize / 2)

  const [back, ahead] = horizontal
    ? forward
      ? [LEFT, RIGHT]
      : [RIGHT, LEFT]
    : forward
      ? [UP, DOWN]
      : [DOWN, UP]

  // Out of the source, across the band, and into the target.
  for (let main = startMain; main !== turn; main += step) {
    const [x, y] = at(main, fromCross)
    grid.connect(x, y, (main === startMain ? 0 : back) | ahead)
  }
  for (let main = turn + step; main !== endMain + step; main += step) {
    const [x, y] = at(main, toCross)
    grid.connect(x, y, back | (main === endMain ? 0 : ahead))
  }

  if (fromCross === toCross) {
    const [x, y] = at(turn, fromCross)
    grid.connect(x, y, back | ahead)
  } else {
    const crossStep = toCross > fromCross ? 1 : -1
    const crossBack = horizontal
      ? crossStep === 1
        ? UP
        : DOWN
      : crossStep === 1
        ? LEFT
        : RIGHT
    const crossAhead = horizontal
      ? crossStep === 1
        ? DOWN
        : UP
      : crossStep === 1
        ? RIGHT
        : LEFT

    for (let cross = fromCross; cross !== toCross + crossStep; cross += crossStep) {
      const [x, y] = at(turn, cross)
      grid.connect(
        x,
        y,
        (cross === fromCross ? back : crossBack) | (cross === toCross ? ahead : crossAhead),
      )
    }
  }

  if (link.last && link.edge.arrow) {
    const [x, y] = at(endMain, toCross)
    grid.put(x, y, arrowhead(horizontal, forward))
  }

  if (link.label) {
    // Beside the run into the target rather than on the turn: the turn is
    // where lines from every sibling link cross.
    const [x, y] = at(turn + step, toCross)
    if (horizontal) grid.text(x, y - 1, link.label)
    else grid.text(x + 2, y, link.label)
  }
}

/**
 * A link that runs against the flow, routed out past every box and back.
 *
 * Two links meeting head-on in the same band is unreadable, and a diagram
 * with a loop in it — a retry, a rollback — is exactly where the reader most
 * needs to see which way round it goes.
 */
function drawDetour(
  grid: Grid,
  from: Placed,
  to: Placed,
  link: Link,
  horizontal: boolean,
  at: (main: number, cross: number) => [number, number],
  lane: number,
): void {
  const crossBack = horizontal ? UP : LEFT
  const crossAhead = horizontal ? DOWN : RIGHT
  const mainBack = horizontal ? LEFT : UP
  const mainAhead = horizontal ? RIGHT : DOWN

  const fromMain = from.main + Math.floor(from.mainSize / 2)
  const toMain = to.main + Math.floor(to.mainSize / 2)
  const fromEdge = from.cross + from.crossSize
  const toEdge = to.cross + to.crossSize

  for (let cross = fromEdge; cross < lane; cross++) {
    const [x, y] = at(fromMain, cross)
    grid.connect(x, y, (cross === fromEdge ? 0 : crossBack) | crossAhead)
  }
  grid.connect(...at(fromMain, lane), crossBack | mainBack)

  for (let main = fromMain - 1; main > toMain; main--) {
    grid.connect(...at(main, lane), mainBack | mainAhead)
  }
  grid.connect(...at(toMain, lane), mainAhead | crossBack)

  for (let cross = lane - 1; cross > toEdge; cross--) {
    grid.connect(...at(toMain, cross), crossBack | crossAhead)
  }
  if (link.last && link.edge.arrow) {
    const [x, y] = at(toMain, toEdge)
    grid.put(x, y, horizontal ? "▲" : "◀")
  } else {
    grid.connect(...at(toMain, toEdge), crossAhead)
  }

  if (link.label) {
    const middle = Math.floor((fromMain + toMain) / 2)
    const [x, y] = at(middle, lane + 1)
    grid.text(x, y, link.label)
  }
}

function arrowhead(horizontal: boolean, forward: boolean): string {
  if (horizontal) return forward ? "▶" : "◀"
  return forward ? "▼" : "▲"
}

function clampBetween(value: number, a: number, b: number): number {
  const low = Math.min(a, b)
  const high = Math.max(a, b)
  return Math.max(low, Math.min(high, value))
}
