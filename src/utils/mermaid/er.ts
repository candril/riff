/**
 * Draw an entity-relationship diagram in character cells (spec 058).
 *
 * An ER diagram is a graph whose nodes have rows in them, so the flowchart
 * layout does the placing and the lines: an entity is a box with its name
 * above a rule and its attributes lined up in columns below it, and a
 * relationship is a line carrying its cardinalities and verb — `1 places
 * 0..n` — written the way the diagram is read aloud. An identifying
 * relationship is a solid line, a non-identifying one dotted, as in mermaid.
 */

import type { ErDiagram, ErEntity, FlowEdge, FlowNode } from "./types"
import { renderFlowchart } from "./flowchart"

export function renderEr(diagram: ErDiagram): string[] {
  const nodes = diagram.entities.map(entityBox)
  const edges = diagram.relationships.map(
    (relationship): FlowEdge => ({
      from: relationship.from,
      to: relationship.to,
      label: [relationship.fromCardinality, relationship.label, relationship.toCardinality]
        .filter(Boolean)
        .join(" "),
      style: relationship.identifying ? "solid" : "dotted",
      arrow: false,
    }),
  )
  return renderFlowchart({ kind: "flowchart", direction: "TD", nodes, edges, notes: [] })
}

/**
 * The attribute rows are padded to one width so that the box's centring
 * leaves them left-aligned under each other, in columns: type, name, keys.
 */
function entityBox(entity: ErEntity): FlowNode {
  if (entity.attributes.length === 0) {
    return { id: entity.id, label: [entity.label], shape: "rect" }
  }

  const rows = entity.attributes.map((attribute) => [attribute.type, attribute.name, attribute.keys.join(",")])
  const columns = [0, 1, 2].map((column) => Math.max(...rows.map((row) => row[column]!.length)))
  const lines = rows.map((row) => row.map((cell, column) => cell.padEnd(columns[column]!)).join(" ").trimEnd())
  const width = Math.max(entity.label.length, ...lines.map((line) => line.length))

  return {
    id: entity.id,
    label: [entity.label, ...lines.map((line) => line.padEnd(width))],
    shape: "rect",
    divider: 1,
  }
}
