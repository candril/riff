import { describe, expect, test } from "bun:test"
import { TextAttributes } from "@opentui/core"
import { theme } from "../theme"
import { buildSegments, sliceSegments, type SegmentInput } from "./segments"
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

  test("tabs expand to two cells after the overlays land on the raw columns", () => {
    expect(texts(build("\tab", { selection: { from: 2, to: 3 } }))).toEqual(["  a", "b"])
  })

  test("an astral character is one cell", () => {
    expect(texts(build("😀ab", { selection: { from: 2, to: 3 } }))).toEqual(["😀", "a", "b"])
    expect(texts(build("😀a", { flash: { matches: [{ startCol: 0, endCol: 2, label: "s" }] } }))).toEqual(["s", "a"])
  })
})

describe("sliceSegments", () => {
  test("cuts a pane's window by cells", () => {
    const segments = build("\tab", { selection: { from: 2, to: 3 } })
    expect(texts(sliceSegments(segments, 1, 2))).toEqual([" a"])
    expect(texts(sliceSegments(segments, 3, 1))).toEqual(["b"])
  })

  test("never splits an astral character", () => {
    const segments = build("a😀b😀")
    expect(texts(sliceSegments(segments, 1, 2))).toEqual(["😀b"])
    expect(texts(sliceSegments(segments, 3, 1))).toEqual(["😀"])
  })

  test("a window wider than the line keeps what is there", () => {
    const segments = build("ab", { spans: [[0, 1, "keyword"]] })
    expect(sliceSegments(segments, 0, 80)).toEqual(segments)
    expect(sliceSegments(segments, 5, 10)).toEqual([])
  })
})
