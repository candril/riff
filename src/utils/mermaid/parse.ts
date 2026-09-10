/**
 * Read a mermaid source block into the model (spec 058).
 *
 * A tolerant reader, not a validator: anything it does not understand is
 * skipped and noted rather than failing the whole diagram, because half a
 * diagram still tells a reviewer more than a wall of source does.
 */

import type {
  Direction,
  FlowEdge,
  FlowNode,
  MermaidDiagram,
  NodeShape,
  Participant,
  SequenceEvent,
} from "./types"

const DIRECTIONS: Record<string, Direction> = {
  TD: "TD",
  TB: "TD",
  BT: "BT",
  LR: "LR",
  RL: "RL",
}

/** Statements riff reads past: they style a diagram rather than shape it. */
const IGNORED = /^(?:style|classDef|class|click|linkStyle|accTitle|accDescr|direction)\b/

export function parseMermaid(source: string): MermaidDiagram {
  const lines = source
    .split("\n")
    .map((line) => line.replace(/%%.*$/, "").trim())
    .filter((line) => line.length > 0)

  // `graph TD; A-->B` puts the first statement on the header's own line.
  const [header = "", ...trailing] = (lines[0] ?? "").split(";")
  const body = [...trailing, ...lines.slice(1)]
  const type = header.trim().split(/[\s{]/)[0] ?? ""

  if (type === "graph" || type === "flowchart") {
    return parseFlowchart(header, body)
  }
  if (type === "sequenceDiagram") {
    return parseSequence(statements(body))
  }
  return { kind: "unsupported", type: type || "diagram" }
}

function parseFlowchart(header: string, body: string[]): MermaidDiagram {
  const direction = DIRECTIONS[header.split(/\s+/)[1]?.toUpperCase() ?? ""] ?? "TD"
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []
  const notes: string[] = []

  for (const statement of statements(body)) {
    if (IGNORED.test(statement)) continue

    if (/^subgraph\b/.test(statement)) {
      // Flattened: the nodes inside still show up, their grouping does not.
      if (!notes.includes("subgraphs flattened")) notes.push("subgraphs flattened")
      continue
    }
    if (statement === "end") continue

    const parsed = parseEdgeChain(statement)
    if (!parsed) continue

    for (const node of parsed.nodes) {
      const existing = nodes.get(node.id)
      // A bare `A` later in the file must not wipe the label `A[Start]` set
      // where the node was introduced.
      if (!existing || (existing.label.join() === existing.id && node.label.join() !== node.id)) {
        nodes.set(node.id, node)
      }
    }
    edges.push(...parsed.edges)
  }

  return { kind: "flowchart", direction, nodes: [...nodes.values()], edges, notes }
}

/** Mermaid lets `;` end a statement as well as a newline. */
function statements(lines: string[]): string[] {
  return lines
    .flatMap((line) => line.split(";"))
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/**
 * The arrow forms riff reads, longest first so `-.->` is not seen as `-.-`.
 *
 * Both label spellings are covered: `A -- yes --> B` puts the text inside
 * the arrow, `A -->|yes| B` after it.
 */
const ARROW = new RegExp(
  [
    String.raw`--\s*(?<solidLabel>[^->|]+?)\s*--(?<solidHead>[>ox])?`,
    String.raw`-\.\s*(?<dottedLabel>[^.|>]+?)\s*\.-(?<dottedHead>[>ox])?`,
    String.raw`==\s*(?<thickLabel>[^=|>]+?)\s*==(?<thickHead>[>ox])?`,
    String.raw`(?<plain>-\.-{1,}[>ox]|-\.-|={2,}[>ox]|={2,}|-{2,}[>ox]|-{2,})`,
  ].join("|"),
  "g",
)

interface EdgeChain {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

/**
 * One statement, which may chain: `A --> B --> C`, and may fan out with
 * `A --> B & C`.
 */
function parseEdgeChain(statement: string): EdgeChain | null {
  ARROW.lastIndex = 0
  const nodes: FlowNode[] = []
  const edges: FlowEdge[] = []

  let cursor = 0
  let previous: FlowNode[] | null = null
  let match: RegExpExecArray | null

  while ((match = ARROW.exec(statement)) !== null) {
    const groups = match.groups!
    const source = parseNodeGroup(statement.slice(cursor, match.index))
    cursor = match.index + match[0].length

    // A label in `|…|` after the arrow, which the arrow regex leaves behind.
    const after = statement.slice(cursor)
    const piped = after.match(/^\s*\|([^|]*)\|/)
    if (piped) cursor += piped[0].length

    const label = (groups.solidLabel ?? groups.dottedLabel ?? groups.thickLabel ?? piped?.[1])?.trim()
    const arrowText = match[0]
    const style = arrowText.includes(".") ? "dotted" : arrowText.includes("=") ? "thick" : "solid"
    const arrow = /[>ox]$/.test(arrowText.trimEnd()) || Boolean(groups.solidHead ?? groups.dottedHead ?? groups.thickHead)

    if (source.length > 0) {
      nodes.push(...source)
      previous = source
    }
    if (!previous) return null

    // Targets are only known once the next arrow (or the end) is reached, so
    // the edge is recorded when the following node group is read.
    const nextArrow = nextArrowIndex(statement, cursor)
    const targets = parseNodeGroup(statement.slice(cursor, nextArrow))
    if (targets.length === 0) break
    nodes.push(...targets)

    for (const from of previous) {
      for (const to of targets) {
        edges.push({ from: from.id, to: to.id, label: label || undefined, style, arrow })
      }
    }
    previous = targets
    ARROW.lastIndex = nextArrow
  }

  if (edges.length === 0) {
    // A statement with no arrow still introduces its node: `A[Start]`.
    const single = parseNodeGroup(statement)
    if (single.length === 0) return null
    return { nodes: single, edges: [] }
  }

  return { nodes, edges }
}

function nextArrowIndex(statement: string, from: number): number {
  const probe = new RegExp(ARROW.source, "g")
  probe.lastIndex = from
  const match = probe.exec(statement)
  return match ? match.index : statement.length
}

/** `B & C` — mermaid's fan-out — is a group of nodes, not one node. */
function parseNodeGroup(text: string): FlowNode[] {
  return text
    .split("&")
    .map((part) => parseNode(part.trim()))
    .filter((node): node is FlowNode => node !== null)
}

const SHAPES: [open: string, close: string, shape: NodeShape][] = [
  ["([", "])", "stadium"],
  ["[[", "]]", "rect"],
  ["[(", ")]", "rect"],
  ["((", "))", "circle"],
  ["{{", "}}", "decision"],
  ["[/", "/]", "rect"],
  ["[\\", "\\]", "rect"],
  ["[", "]", "rect"],
  ["(", ")", "round"],
  ["{", "}", "decision"],
  [">", "]", "rect"],
]

function parseNode(text: string): FlowNode | null {
  if (!text) return null

  for (const [open, close, shape] of SHAPES) {
    const start = text.indexOf(open)
    if (start <= 0 || !text.endsWith(close)) continue
    const id = text.slice(0, start).trim()
    if (!isId(id)) continue
    const label = text.slice(start + open.length, text.length - close.length)
    return { id, label: splitLabel(label) || [id], shape }
  }

  const id = text.trim()
  return isId(id) ? { id, label: [id], shape: "rect" } : null
}

function isId(text: string): boolean {
  return /^[A-Za-z0-9_.\-]+$/.test(text)
}

function splitLabel(label: string): string[] | null {
  const unquoted = label.trim().replace(/^["'](.*)["']$/s, "$1")
  const parts = unquoted
    .split(/<br\s*\/?>/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return parts.length > 0 ? parts : null
}

/** Longest arrow first, and a lazy sender, or `B-->>A` reads as `B-` `->>`. */
const SEQUENCE_MESSAGE =
  /^(?<from>\S+?)\s*(?<arrow>-->>|--x|--\)|-->|->>|->|-x|-\))\s*(?<to>[^\s:]+)\s*:\s*(?<label>.*)$/

const SEQUENCE_BLOCK = /^(loop|alt|else|opt|par|and|critical|break|rect)\b\s*(.*)$/

function parseSequence(body: string[]): MermaidDiagram {
  const participants = new Map<string, Participant>()
  const events: SequenceEvent[] = []
  const notes: string[] = []

  const remember = (id: string): string => {
    if (!participants.has(id)) participants.set(id, { id, label: id })
    return id
  }

  for (const statement of body) {
    const declared = statement.match(/^(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/)
    if (declared) {
      const id = declared[1]!
      participants.set(id, { id, label: (declared[2] ?? id).trim() })
      continue
    }

    const note = statement.match(/^Note\s+(?:over|left of|right of)\s+([^:]+):\s*(.*)$/i)
    if (note) {
      const over = note[1]!.split(",").map((name) => remember(name.trim()))
      events.push({ kind: "note", over, label: note[2]!.trim() })
      continue
    }

    if (statement === "end") {
      events.push({ kind: "block", label: "end" })
      continue
    }

    const block = statement.match(SEQUENCE_BLOCK)
    if (block) {
      events.push({ kind: "block", label: [block[1], block[2]].filter(Boolean).join(" ").trim() })
      continue
    }

    const message = statement.match(SEQUENCE_MESSAGE)
    if (!message) {
      if (statement && !notes.includes("some statements skipped")) {
        notes.push("some statements skipped")
      }
      continue
    }

    const arrow = message.groups!.arrow!
    events.push({
      kind: "message",
      from: remember(message.groups!.from!),
      to: remember(message.groups!.to!),
      label: message.groups!.label!.trim(),
      style: arrow.startsWith("--") ? "dotted" : "solid",
      arrow: arrow.endsWith("x") ? "cross" : arrow.endsWith(">>") || arrow.endsWith(">") ? "head" : "open",
    })
  }

  return { kind: "sequence", participants: [...participants.values()], events, notes }
}
