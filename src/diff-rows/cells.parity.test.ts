import { afterAll, describe, expect, test } from "bun:test"
import { TextRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { cellsOf, graphemeCells } from "./cells"

// What OpenTUI draws a grapheme in is native and readable only off a laid-out
// renderable, so this keeps graphemeCells true to it across OpenTUI upgrades.
const setup = await createTestRenderer({ width: 80, height: 4 })

afterAll(() => setup.renderer.destroy())

async function openTuiCells(content: string): Promise<number> {
  const text = new TextRenderable(setup.renderer, { content, width: 60, wrapMode: "none" })
  setup.renderer.root.add(text)
  await setup.renderOnce()
  const cells = Array.from(text.lineInfo.lineWidthCols).reduce((sum, width) => sum + width, 0)
  text.destroy()
  return cells
}

const corpus = ["中", "Ａ", "ｱ", "😀", "❤\ufe0f", "🇨🇭", "e\u0301", "→", "✓", "\u200b", "a", "\t", "\r", "\x1b", "\x7f", "\x0c", "\u00ad", "👍🏽", "👨\u200d👩\u200d👧", "✔\ufe0f", "©\ufe0f"]
// A CRLF file leaves a \r at the end of every line, on ASCII lines and others alike.
const CONTROL_LINES = ["abc\r", "a\x1bb", "é\r"]
const MIXED = "const 名前 = \"Ａｱ😀\" // ✓ e\u0301 → 🇨🇭❤\ufe0f\u200b"

describe("graphemeCells against OpenTUI", () => {
  test("each grapheme of the corpus", async () => {
    for (const grapheme of corpus) {
      const cells = await openTuiCells(grapheme)
      expect({ grapheme, cells: graphemeCells(grapheme) }).toEqual({ grapheme, cells })
      expect({ grapheme, cells: cellsOf(grapheme) }).toEqual({ grapheme, cells })
    }
  })

  test("a line mixing them", async () => {
    expect(cellsOf(MIXED)).toBe(await openTuiCells(MIXED))
  })

  test("lines holding a control character", async () => {
    for (const line of CONTROL_LINES) {
      expect({ line, cells: cellsOf(line) }).toEqual({ line, cells: await openTuiCells(line) })
    }
  })
})
