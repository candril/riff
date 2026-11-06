import { describe, expect, test } from "bun:test"
import { TextAttributes } from "@opentui/core"
import { cellCount } from "../split-view/layout"
import { theme } from "../theme"
import { cellsOf } from "./cells"
import { contrast } from "./contrast"
import { ADDITION_BG, CURSOR_ADDITION_BG, CURSOR_DELETION_BG, DELETION_BG } from "./line-colors"
import { buildSegments, sliceSegments, type Segment, type SegmentInput } from "./segments"
import { SYNTAX_PALETTE } from "./syntax-palette"

const base: SegmentInput = { wordSide: "added", baseFg: theme.text, rowBg: theme.base }
const build = (text: string, input: Partial<SegmentInput> = {}) => buildSegments(text, { ...base, ...input })
const texts = (segments: { text: string }[]) => segments.map((s) => s.text)
const added = SYNTAX_PALETTE["diff.word.added"]!.bg

describe("buildSegments", () => {
  test("plain text is one segment", () => {
    expect(build("const a = 1")).toEqual([{ text: "const a = 1", fg: theme.text, attributes: 0 }])
  })

  test("captures colour their ranges", () => {
    expect(build("if x // no", { spans: [[0, 2, "keyword"], [5, 10, "comment"]] })).toEqual([
      { text: "if", fg: theme.mauve, attributes: 0 },
      { text: " x ", fg: theme.text, attributes: 0 },
      { text: "// no", fg: theme.overlay0, attributes: TextAttributes.ITALIC },
    ])
    expect(build("## Hi", { spans: [[0, 5, "markup.heading.2"]] })).toEqual([
      { text: "## Hi", fg: theme.peach, attributes: TextAttributes.BOLD },
    ])
  })

  test("a dotted capture falls back to its first part", () => {
    expect(build("import", { spans: [[0, 6, "keyword.control.import"]] })[0]!.fg).toBe(theme.mauve)
  })

  test("the more specific capture wins wherever it came in the list", () => {
    const spans = [[0, 3, "markup.link.url"], [0, 3, "markup.link"]] as const
    expect(build("url", { spans })).toEqual([{ text: "url", fg: theme.blue, attributes: TextAttributes.UNDERLINE }])
  })

  test("a changed word gets its background under the syntax colour", () => {
    expect(build("'a' + b", { spans: [[0, 3, "string"]], words: [{ startCol: 1, endCol: 6 }] })).toEqual([
      { text: "'", fg: theme.green, attributes: 0 },
      { text: "a'", fg: theme.green, bg: added, attributes: 0 },
      { text: " + ", fg: theme.text, bg: added, attributes: 0 },
      { text: "b", fg: theme.text, attributes: 0 },
    ])
    const removed = build("x", { wordSide: "removed", words: [{ startCol: 0, endCol: 1 }] })
    expect(removed[0]!.bg).toBe(SYNTAX_PALETTE["diff.word.removed"]!.bg)
  })

  describe("a dim syntax colour on a diff background", () => {
    const comment = [[0, 1, "comment"]] as const
    const removed = SYNTAX_PALETTE["diff.word.removed"]!.bg!

    test.each([
      ["a changed word, added", { words: [{ startCol: 0, endCol: 1 }] }, added!],
      ["a changed word, removed", { wordSide: "removed", words: [{ startCol: 0, endCol: 1 }] }, removed],
      ["the added row", { rowBg: ADDITION_BG }, ADDITION_BG],
      ["the removed row", { rowBg: DELETION_BG }, DELETION_BG],
      ["the added cursor row", { rowBg: CURSOR_ADDITION_BG }, CURSOR_ADDITION_BG],
      ["the removed cursor row", { rowBg: CURSOR_DELETION_BG }, CURSOR_DELETION_BG],
      ["the selection", { selection: { from: 0, to: 1 } }, theme.surface1],
    ] as [string, Partial<SegmentInput>, string][])("reads on %s", (_name, input, bg) => {
      const [cell] = build("a", { spans: comment, ...input })
      expect(contrast(cell!.fg, bg)).toBeGreaterThanOrEqual(3.3)
      expect(cell!.attributes).toBe(TextAttributes.ITALIC)
    })

    test("stays as it is on the plain diff", () => {
      expect(build("a", { spans: comment })[0]!.fg).toBe(theme.overlay0)
    })

    test("is still dimmer than plain text on the same word", () => {
      const [cell] = build("a", { spans: comment, words: [{ startCol: 0, endCol: 1 }] })
      expect(contrast(cell!.fg, added!)).toBeLessThan(contrast(theme.text, added!))
    })
  })

  test("a search match inside a changed word shows as a match, the current one above the rest", () => {
    const segments = build("abcdef", {
      words: [{ startCol: 0, endCol: 6 }],
      search: { matches: [{ startCol: 1, endCol: 3, current: true }, { startCol: 2, endCol: 5, current: false }] },
    })
    expect(segments).toEqual([
      { text: "a", fg: theme.text, bg: added, attributes: 0 },
      { text: "bc", fg: theme.base, bg: theme.peach, attributes: 0 },
      { text: "de", fg: theme.base, bg: theme.yellow, attributes: 0 },
      { text: "f", fg: theme.text, bg: added, attributes: 0 },
    ])
  })

  test("the selection keeps the colour of the text and reaches past the end of an empty line", () => {
    expect(build("ab", { spans: [[0, 2, "keyword"]], selection: { from: 1, to: 2 } })).toEqual([
      { text: "a", fg: theme.mauve, attributes: 0 },
      { text: "b", fg: theme.mauve, bg: theme.surface1, attributes: 0 },
    ])
    expect(build("", { selection: { from: 0, to: 1 } })).toEqual([
      { text: " ", fg: theme.text, bg: theme.surface1, attributes: 0 },
    ])
  })

  test("flash fades the text, recolours the match and labels its first character", () => {
    const segments = build("if foo", {
      spans: [[0, 2, "keyword"]],
      flash: { matches: [{ startCol: 3, endCol: 6, label: "s" }] },
    })
    expect(segments).toEqual([
      { text: "if", fg: "#51466a", attributes: 0 },
      { text: " ", fg: "#525569", attributes: 0 },
      { text: "s", fg: theme.base, bg: theme.red, attributes: TextAttributes.BOLD },
      { text: "oo", fg: theme.text, bg: theme.surface1, attributes: 0 },
    ])
  })

  test("flash fades towards the background an overlay set", () => {
    const [cell] = build("a", { words: [{ startCol: 0, endCol: 1 }], flash: { matches: [] } })
    expect(cell!.fg).toBe("#5b8b7d")
  })

  test("the cursor is a block over the search match under it, and sits past an empty line's end", () => {
    const segments = build("abc", { search: { matches: [{ startCol: 0, endCol: 3, current: true }] }, cursor: 1 })
    expect(segments).toEqual([
      { text: "a", fg: theme.base, bg: theme.peach, attributes: 0 },
      { text: "b", fg: theme.base, bg: theme.rosewater, attributes: 0 },
      { text: "c", fg: theme.base, bg: theme.peach, attributes: 0 },
    ])
    expect(build("", { cursor: 0 })).toEqual([{ text: " ", fg: theme.base, bg: theme.rosewater, attributes: 0 }])
  })

  test("tabs expand to two cells after the overlays land on the raw columns", () => {
    expect(texts(build("\tab", { selection: { from: 2, to: 3 } }))).toEqual(["  a", "b"])
  })

  test("a grapheme is never split, an overlay on its later units aside", () => {
    expect(texts(build("😀ab", { selection: { from: 2, to: 3 } }))).toEqual(["😀", "a", "b"])
    expect(texts(build("e\u0301z", { selection: { from: 1, to: 3 } }))).toEqual(["e\u0301", "z"])
  })

  test("a flash label on a wide glyph is padded to its two cells, as on a tab", () => {
    expect(texts(build("中a", { flash: { matches: [{ startCol: 0, endCol: 1, label: "s" }] } }))).toEqual(["s ", "a"])
    expect(texts(build("😀a", { flash: { matches: [{ startCol: 0, endCol: 2, label: "s" }] } }))).toEqual(["s ", "a"])
    expect(texts(build("\ta", { flash: { matches: [{ startCol: 0, endCol: 1, label: "s" }] } }))).toEqual(["s ", "a"])
  })

  test("the cursor on an emoji colours the whole glyph, from either of its units", () => {
    const block = { text: "😀", fg: theme.base, bg: theme.rosewater, attributes: 0 }
    const plain = (text: string) => ({ text, fg: theme.text, attributes: 0 })
    expect(build("x😀y", { cursor: 1 })).toEqual([plain("x"), block, plain("y")])
    expect(build("x😀y", { cursor: 2 })).toEqual([plain("x"), block, plain("y")])
    expect(build("e\u0301z", { cursor: 1 })[0]).toEqual({ text: "e\u0301", fg: theme.base, bg: theme.rosewater, attributes: 0 })
  })
})

describe("sliceSegments", () => {
  test("cuts a pane's window by cells", () => {
    const segments = build("\tab", { selection: { from: 2, to: 3 } })
    expect(texts(sliceSegments(segments, 1, 2))).toEqual([" a"])
    expect(texts(sliceSegments(segments, 3, 1))).toEqual(["b"])
  })

  test("a wide glyph inside the window is drawn whole", () => {
    const segments = build("a😀b😀")
    expect(texts(sliceSegments(segments, 1, 3))).toEqual(["😀b"])
    expect(texts(sliceSegments(segments, 4, 2))).toEqual(["😀"])
  })

  test("a wide glyph cut by either edge draws as spaces for its cells inside, never more than the width", () => {
    const segments = build("a中b中c", { selection: { from: 2, to: 3 } })
    const cells = (shown: Segment[]) => shown.reduce((sum, { text }) => sum + Bun.stringWidth(text), 0)
    expect(texts(sliceSegments(segments, 2, 3))).toEqual([" ", "b", " "])
    expect(texts(sliceSegments(segments, 0, 2))).toEqual(["a "])
    expect(texts(sliceSegments(segments, 5, 2))).toEqual([" c"])
    for (let from = 0; from < 7; from++) {
      for (let width = 1; width <= 7 - from; width++) expect(cells(sliceSegments(segments, from, width))).toBe(width)
    }
  })

  test("a CRLF line's \\r takes no cell in a segment, as it takes none over the whole line", () => {
    const line = "é = abc\r"
    const segments = build(line, { spans: [[0, 1, "keyword"]] })
    expect(cellCount(segments)).toBe(cellsOf(line))
    expect(sliceSegments(segments, 0, 80)).toEqual(segments)
    expect(cellCount(sliceSegments(segments, 2, 5))).toBe(5)
    expect(texts(sliceSegments(segments, 4, 3))).toEqual(["abc"])
  })

  test("a window wider than the line keeps what is there", () => {
    const segments = build("ab", { spans: [[0, 1, "keyword"]] })
    expect(sliceSegments(segments, 0, 80)).toEqual(segments)
    expect(sliceSegments(segments, 5, 10)).toEqual([])
  })
})
