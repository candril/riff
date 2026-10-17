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

const corpus = ["中", "Ａ", "ｱ", "😀", "❤\ufe0f", "🇨🇭", "e\u0301", "→", "✓", "\u200b", "a", "\t"]
const MIXED = "const 名前 = \"Ａｱ😀\" // ✓ e\u0301 → 🇨🇭❤\ufe0f\u200b"

// The test renderer measures with wcwidth, which adds up a skin-toned or
// ZWJ emoji's parts and ignores a variation selector that makes a
// text-default symbol an emoji. Measured by Unicode — the method OpenTUI
// picks when the terminal reports it — each is one wide glyph, as
// Bun.stringWidth and riff count it. Once OpenTUI's test renderer agrees,
// this test fails and the list goes.
const WCWIDTH_DISAGREES = ["👍🏽", "👨\u200d👩\u200d👧", "✔\ufe0f", "©\ufe0f"]

describe("graphemeCells against OpenTUI", () => {
  test("each grapheme of the corpus", async () => {
    for (const grapheme of corpus) {
      expect({ grapheme, cells: graphemeCells(grapheme) }).toEqual({ grapheme, cells: await openTuiCells(grapheme) })
    }
  })

  test("a line mixing them", async () => {
    expect(cellsOf(MIXED)).toBe(await openTuiCells(MIXED))
  })

  test("wcwidth draws the named exceptions in other widths than riff counts", async () => {
    for (const grapheme of WCWIDTH_DISAGREES) {
      expect({ grapheme, cells: graphemeCells(grapheme) }).toEqual({ grapheme, cells: 2 })
      expect(await openTuiCells(grapheme)).not.toBe(graphemeCells(grapheme))
    }
  })
})
