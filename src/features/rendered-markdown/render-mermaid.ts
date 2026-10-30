/**
 * A mermaid block drawn in a rendered markdown file (spec 111), with 058's
 * renderer. The drawing has no line of its own in the source, so every row
 * sits on the opening fence and stands for the block down to `lastLine`.
 */
import { renderMermaid } from "../../utils/mermaid"
import type { RenderedRow } from "./render"

const MERMAID = /^mermaid$/i

export function isMermaidFence(info: string): boolean {
  return MERMAID.test(info.trim().split(/\s+/)[0] ?? "")
}

/** Null when riff cannot draw the block, which then stays its source. */
export function renderMermaidBlock(source: string, fenceLine: number, lastLine: number): RenderedRow[] | null {
  const drawing = drawMermaid(source)
  if (drawing.length === 0) return null
  // The diagram peek draws a drawing in the plain foreground, so these rows carry no spans either.
  return drawing.map((text, part) => ({ text, sourceLine: fenceLine, spans: [], part, lastLine }))
}

/** One diagram the renderer chokes on must not take the rest of the file with it. */
function drawMermaid(source: string): string[] {
  try {
    return renderMermaid(source).lines
  } catch {
    return []
  }
}
