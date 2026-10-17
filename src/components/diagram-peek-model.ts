import {
  CHROME_ROWS,
  PADDING,
  otherVersion,
  segments,
  sideLabel,
  textRows,
  viewport,
  type PeekModel,
  type Screen,
  type Scroll,
  type Side,
} from "./peek-model"

/** What the header calls each kind; a flowchart is just "mermaid". */
const DIAGRAM_TITLE: Partial<Record<DiagramPeekInput["kind"], string>> = {
  sequence: "sequence",
  state: "state",
  er: "entities",
}

export interface DiagramPeekInput extends Screen {
  /** The drawing, one string per row. Empty falls back to `source`. */
  lines: string[]
  /** The mermaid source, shown when there is nothing to draw. */
  source: string[]
  kind: "flowchart" | "sequence" | "state" | "er" | "unsupported"
  /** Which version of the block is on show. */
  side: Side
  /** Whether Tab has another version to switch to. */
  hasOther: boolean
  note?: string
  /** Where the window onto the drawing sits; clamped to the drawing here. */
  scroll: Scroll
}

/**
 * The mermaid block under the cursor, drawn. The diff can only show the
 * source, the only thing a comment can anchor to; whether the diagram it
 * describes is right is answered here.
 */
export function diagramPeekModel(input: DiagramPeekInput): PeekModel {
  const { lines, source, kind, side, hasOther, note, scroll, terminalWidth, terminalHeight } = input
  const drawn = lines.length > 0
  // A window onto the drawing, not a clip of it: what does not fit is a
  // scroll away rather than gone (hjkl, like the diff).
  const view = viewport(drawn ? lines : source, scroll, Math.max(3, terminalHeight - CHROME_ROWS), Math.max(20, terminalWidth - 8))
  return {
    id: "diagram-peek",
    width: Math.max(...view.lines.map((line) => line.length), 24) + PADDING * 2,
    header: segments(
      { text: DIAGRAM_TITLE[kind] ?? "mermaid", tone: "primary" },
      sideLabel(side),
      note ? { text: `· ${note}`, tone: "dim" } : null,
      view.where ? { text: `· ${view.where}`, tone: "yellow" } : null,
      drawn ? null : { text: "· source", tone: "dim" }
    ),
    body: textRows(view.lines),
    footer: [hasOther ? otherVersion(side) : null, view.scrollable ? "hjkl to scroll" : null, "gl or Esc to close"]
      .filter(Boolean)
      .join(" · "),
  }
}
