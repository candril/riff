/**
 * Mermaid, drawn in characters (spec 058).
 *
 * The point is not to reproduce mermaid.js in a terminal — it is that a
 * reviewer reading a diff should be able to see the diagram the change makes,
 * not only the source that describes it.
 */

import { parseMermaid } from "./parse"
import { renderFlowchart } from "./flowchart"
import { renderSequence } from "./sequence"

export interface MermaidRender {
  /** The drawing, one string per row. Empty when riff cannot draw it. */
  lines: string[]
  kind: "flowchart" | "sequence" | "unsupported"
  /** Why there is nothing to look at, or what was left out of it. */
  note?: string
}

export function renderMermaid(source: string): MermaidRender {
  const diagram = parseMermaid(source)

  if (diagram.kind === "unsupported") {
    return { lines: [], kind: "unsupported", note: `riff can't draw a ${diagram.type} yet` }
  }

  const lines =
    diagram.kind === "flowchart" ? renderFlowchart(diagram) : renderSequence(diagram)

  return {
    lines,
    kind: diagram.kind,
    note: diagram.notes.length > 0 ? diagram.notes.join(", ") : undefined,
  }
}

export { parseMermaid } from "./parse"
export type { MermaidDiagram } from "./types"
