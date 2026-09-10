/**
 * A character canvas for drawing diagrams (spec 058).
 *
 * Lines are written as connection masks rather than glyphs so that crossings
 * and joins resolve themselves: two lines meeting in a cell become `┼` or
 * `├` because of what connects there, not because the caller worked it out.
 * Text and box borders are written literally and lines never overwrite them.
 */

export const UP = 1
export const DOWN = 2
export const LEFT = 4
export const RIGHT = 8

const GLYPHS: Record<number, string> = {
  [UP]: "│",
  [DOWN]: "│",
  [UP | DOWN]: "│",
  [LEFT]: "─",
  [RIGHT]: "─",
  [LEFT | RIGHT]: "─",
  [UP | RIGHT]: "└",
  [UP | LEFT]: "┘",
  [DOWN | RIGHT]: "┌",
  [DOWN | LEFT]: "┐",
  [UP | DOWN | RIGHT]: "├",
  [UP | DOWN | LEFT]: "┤",
  [LEFT | RIGHT | DOWN]: "┬",
  [LEFT | RIGHT | UP]: "┴",
  [UP | DOWN | LEFT | RIGHT]: "┼",
}

export class Grid {
  private chars = new Map<number, string>()
  private masks = new Map<number, number>()
  private width = 0
  private height = 0

  private key(x: number, y: number): number {
    return y * 100000 + x
  }

  private grow(x: number, y: number): void {
    if (x + 1 > this.width) this.width = x + 1
    if (y + 1 > this.height) this.height = y + 1
  }

  /** A literal character; lines drawn later leave it alone. */
  put(x: number, y: number, char: string): void {
    if (x < 0 || y < 0) return
    this.chars.set(this.key(x, y), char)
    this.grow(x, y)
  }

  text(x: number, y: number, text: string): void {
    for (let i = 0; i < text.length; i++) this.put(x + i, y, text[i]!)
  }

  /** One cell of a line, described by what it connects to. */
  connect(x: number, y: number, mask: number): void {
    if (x < 0 || y < 0) return
    const key = this.key(x, y)
    if (this.chars.has(key)) return
    this.masks.set(key, (this.masks.get(key) ?? 0) | mask)
    this.grow(x, y)
  }

  toLines(): string[] {
    const lines: string[] = []
    for (let y = 0; y < this.height; y++) {
      let line = ""
      for (let x = 0; x < this.width; x++) {
        const key = this.key(x, y)
        const char = this.chars.get(key)
        if (char !== undefined) {
          line += char
          continue
        }
        const mask = this.masks.get(key)
        line += mask === undefined ? " " : GLYPHS[mask] ?? "┼"
      }
      lines.push(line.replace(/\s+$/, ""))
    }
    return lines
  }
}
