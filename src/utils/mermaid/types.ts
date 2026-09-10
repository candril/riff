/**
 * The slice of mermaid riff can draw (spec 058).
 *
 * Enough of a model to lay a diagram out in character cells, and no more:
 * styling, classes and links are read past, because a terminal cannot show
 * them and a reviewer does not need them to see the shape of the graph.
 */

export type Direction = "TD" | "BT" | "LR" | "RL"

export type NodeShape = "rect" | "round" | "stadium" | "circle" | "decision"

export interface FlowNode {
  id: string
  /** One entry per `<br>` — mermaid's way of breaking a label. */
  label: string[]
  shape: NodeShape
}

export interface FlowEdge {
  from: string
  to: string
  label?: string
  style: "solid" | "dotted" | "thick"
  /** `---` joins two nodes without pointing at either. */
  arrow: boolean
}

export interface FlowchartDiagram {
  kind: "flowchart"
  direction: Direction
  nodes: FlowNode[]
  edges: FlowEdge[]
  /** What was dropped on the way in, for the reader to be told about. */
  notes: string[]
}

export interface Participant {
  id: string
  label: string
}

export type SequenceEvent =
  | {
      kind: "message"
      from: string
      to: string
      label: string
      style: "solid" | "dotted"
      arrow: "head" | "open" | "cross"
    }
  | { kind: "note"; over: string[]; label: string }
  /** `loop`, `alt`, `opt`, `par` and their `else`/`end`. */
  | { kind: "block"; label: string }

export interface SequenceDiagram {
  kind: "sequence"
  participants: Participant[]
  events: SequenceEvent[]
  notes: string[]
}

export interface UnsupportedDiagram {
  kind: "unsupported"
  /** The diagram type as mermaid names it, e.g. `stateDiagram-v2`. */
  type: string
}

export type MermaidDiagram = FlowchartDiagram | SequenceDiagram | UnsupportedDiagram
