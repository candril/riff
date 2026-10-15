import { describe, expect, test } from "bun:test"
import { buildSegments } from "../diff-rows/segments"
import { theme } from "../theme"
import { FAR_HUNK, TWO_FILES } from "../testing/diffs"
import { parseDiff } from "../utils/diff-parser"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { cellCount, contentOrigin, dividerLabel, gutterWidth, halfContent, paneWidths } from "./layout"

const mappingOf = (raw: string) => new DiffLineMapping(parseDiff(raw), "all")
const texts = (segments: { text: string }[]) => segments.map((s) => s.text).join("")
const segmentsOf = (text: string) => buildSegments(text, { wordSide: "added", baseFg: theme.text, rowBg: theme.base })

describe("paneWidths", () => {
  test("an odd width gives the extra cell to the new file", () => {
    expect(paneWidths(120)).toEqual({ left: 60, right: 60 })
    expect(paneWidths(121)).toEqual({ left: 60, right: 61 })
  })
})

describe("gutterWidth", () => {
  // Unified draws `   1 ` and `  503 ` (VimDiffView.frames.test.ts): a sign cell, the number, a space.
  test("matches unified's number column, so a toggle leaves the code where it was", () => {
    expect(gutterWidth(mappingOf(TWO_FILES))).toBe(3)
    expect(contentOrigin(gutterWidth(mappingOf(TWO_FILES)))).toBe("   1 ".length)
    expect(gutterWidth(mappingOf(FAR_HUNK))).toBe(4)
    expect(contentOrigin(gutterWidth(mappingOf(FAR_HUNK)))).toBe("  503 ".length)
  })
})

describe("dividerLabel", () => {
  test("names the run and the key that opens it, or that it is being fetched", () => {
    expect(dividerLabel({ content: "502 lines", dividerKey: "k" }, null)).toBe("▸ 502 lines  ↵")
    expect(dividerLabel({ content: "502 lines", dividerKey: "k" }, "k")).toBe("⟳ Expanding 502 lines…")
    expect(dividerLabel({ content: "", dividerKey: "k" }, "other")).toBe("▸ ...  ↵")
  })
})

describe("halfContent", () => {
  const line = segmentsOf("abcdefghij")

  test("a line that fits is drawn whole, unmarked", () => {
    expect(halfContent(line, 0, 10)).toEqual({ segments: line, left: false, right: false })
  })

  test("a line running past the window ends in a marker on the last cell", () => {
    const half = halfContent(line, 0, 5)
    expect(texts(half.segments)).toBe("abcd›")
    expect(half.segments.at(-1)!.fg).toBe(theme.surface2)
    expect(half).toMatchObject({ left: false, right: true })
  })

  test("scrolled, the first cell is a marker; both edges can be marked at once", () => {
    expect(texts(halfContent(line, 3, 10).segments)).toBe("‹efghij")
    expect(texts(halfContent(line, 3, 4).segments)).toBe("‹ef›")
    expect(cellCount(halfContent(line, 3, 4).segments)).toBe(4)
  })

  test("an empty line has nothing out of view", () => {
    expect(halfContent([], 3, 10)).toEqual({ segments: [], left: false, right: false })
  })
})
