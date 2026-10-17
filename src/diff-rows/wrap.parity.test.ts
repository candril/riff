import { afterAll, describe, expect, test } from "bun:test"
import { TextRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { wrapLine } from "./wrap"

// OpenTUI's wrap is native and readable only off a laid-out renderable, so
// this is what keeps wrapLine true to it across OpenTUI upgrades.
const setup = await createTestRenderer({ width: 80, height: 4 })

afterAll(() => setup.renderer.destroy())

async function openTuiWrap(content: string, width: number) {
  const text = new TextRenderable(setup.renderer, { content, width, wrapMode: "word" })
  setup.renderer.root.add(text)
  await setup.renderOnce()
  const info = text.lineInfo
  const rows = { starts: Array.from(info.lineStartCols), cells: Array.from(info.lineWidthCols) }
  text.destroy()
  return rows
}

const PRINTABLE = Array.from({ length: 126 - 33 + 1 }, (_, i) => String.fromCharCode(33 + i))

const corpus = [
  "",
  "aaa bbb ccc ddd eee fff ggg hhh iii",
  "x".repeat(30),
  "a\tb\tc\td\te\tf\tg\th\ti",
  "foo  bar   baz    quux  zz",
  "a.b.c(d,e)-f/g_h:i;j k",
  '  const message = "a fairly long line that keeps going a fairly long line that keeps going "',
  "export function wrapLine(content: string, width: number): WrapSlice[] {",
  "    if (overflows && !(rowHasWord && isWhitespace(code))) return { row, slice: own[offset]! }",
  "\t\tconst url = `https://example.com/a/b?c=d&e=f#g`; // see [docs]{ref}",
  "import { a, b, c } from \"../../some/where/far-away\"",
  "aaa      bbb    ccc  ",
  "        x",
  "   leading indent words",
  "\t\t\t\tx",
  "\tindented\twith\ttabs and spaces  \t mixed",
  "ab abcdefghijklmnopqrstuvwxyz0123456789",
  "supercalifragilisticexpialidocious_identifier_name",
  "a--b--c--d",
  "𝐚𝐛𝐜 𝐝𝐞𝐟 𝐠𝐡𝐢 𝐣𝐤𝐥",
  // Wide glyphs among words: a run of ideographs on its own, and emoji, flags and fullwidth
  // forms, which OpenTUI breaks around no more than around letters.
  "中文字符串測試中文字符串測試",
  "ＡＢＣ😀ＤＥＦ🇨🇭ＧＨＩ❤\ufe0fＪＫＬ",
  "x😀".repeat(20),
  "foo😀bar baz😀qux 😀😀😀😀😀😀😀😀😀😀 end",
  "aaaaaＡbbbbb😀ccccc🇨🇭ddddd😀eeeee",
  "  const label = \"😀 ok\" // ✓ done → next 🇨🇭 flag ＯＫ",
  "\t😀\t😀\t😀 wide after tabs",
  ...PRINTABLE.map((char) => `aaaaa${char}bbbbbbbbbbbb`),
  PRINTABLE.join(""),
  PRINTABLE.join(" "),
]

const WIDTHS = [6, 8, 12, 17, 23, 40]

describe("wrapLine against OpenTUI's word wrap", () => {
  for (const width of WIDTHS) {
    test(`at width ${width}`, async () => {
      for (const content of corpus) {
        const ours = wrapLine(content, width)
        const expected = { content, ...(await openTuiWrap(content, width)) }
        expect({ content, starts: ours.map((slice) => slice.startCell), cells: ours.map((slice) => slice.cells) }).toEqual(expected)
      }
    })
  }

  test("a line exactly the width is one row, and one cell more is two", async () => {
    for (const width of WIDTHS) {
      for (const content of ["a".repeat(width), "a".repeat(width + 1), `${"a".repeat(width - 2)} b`]) {
        const ours = wrapLine(content, width)
        const expected = { content, ...(await openTuiWrap(content, width)) }
        expect({ content, starts: ours.map((slice) => slice.startCell), cells: ours.map((slice) => slice.cells) }).toEqual(expected)
      }
    }
  })
})
