/**
 * The mermaid block under the cursor, drawn (spec 058).
 *
 * The new side is what the peek opens on — a review is about what the change
 * will leave behind — and the old one is a keypress away, because the useful
 * question about a changed diagram is what moved.
 */

import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { findFencedBlock, blockContent, sideOf, type DiffSide } from "../../utils/fenced-blocks"
import { renderMermaid } from "../../utils/mermaid"

export interface PeekedDiagram {
  /** The drawing, or nothing when riff cannot draw this one. */
  lines: string[]
  kind: "flowchart" | "sequence" | "unsupported"
  /** The block's own text, shown when there is no drawing. */
  source: string[]
  side: DiffSide
  /** Whether the other side of the diff has a version of this block. */
  hasOther: boolean
  note?: string
}

const MERMAID = /^mermaid$/i

/** Whether the block reads differently on the two sides of the diff. */
function changed(lines: readonly { type: string }[], block: { start: number; end: number }): boolean {
  for (let i = block.start + 1; i < block.end; i++) {
    const type = lines[i]?.type
    if (type === "addition" || type === "deletion") return true
  }
  return false
}

export function buildMermaidPeek(
  mapping: DiffLineMapping,
  line: number,
  side: DiffSide,
): PeekedDiagram | null {
  const lines = mapping.allLines

  // The span is found on the side the cursor is standing on, then read on
  // whichever side is being shown: a cursor parked on a deleted row still
  // opens the diagram the change arrives at.
  const cursorSide = sideOf(lines[line])
  const block =
    findFencedBlock(lines, line, cursorSide) ??
    findFencedBlock(lines, line, cursorSide === "new" ? "old" : "new")
  if (!block || !MERMAID.test(block.info)) return null

  const otherSide = side === "new" ? "old" : "new"
  const other = blockContent(lines, block, otherSide)

  // A block that was added whole has nothing on the other side; asking for it
  // shows the version that does exist rather than an empty box.
  const shown = blockContent(lines, block, side).length > 0 ? side : otherSide
  const rows = blockContent(lines, block, shown)
  if (rows.length === 0) return null

  const source = rows.map((row) => {
    const content = lines[row]!
    // The file's own text: a diff row may be padded for display.
    return content.sourceContent ?? content.content
  })

  const render = renderMermaid(source.join("\n"))
  return {
    lines: render.lines,
    kind: render.kind,
    source,
    side: shown,
    hasOther: other.length > 0 && rows.length > 0 && changed(lines, block),
    note: render.note,
  }
}
