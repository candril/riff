import { RGBA, type OptimizedBuffer } from "@opentui/core"

const SPACE_CODE_POINT = 32

/**
 * Repaint a cell's background, keeping its glyph and its foreground — a
 * highlight must not flatten the colours of the text it runs over.
 */
export function highlightCell(buffer: OptimizedBuffer, x: number, y: number, bg: RGBA): void {
  const { char, fg, attributes } = buffer.buffers
  const i = y * buffer.width + x
  const at = i * 4
  const glyph = char[i]!
  buffer.drawChar(
    glyph === 0 ? SPACE_CODE_POINT : glyph,
    x,
    y,
    RGBA.fromValues(fg[at]!, fg[at + 1]!, fg[at + 2]!, fg[at + 3]!),
    bg,
    attributes[i]!
  )
}
