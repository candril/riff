import { describe, expect, test } from "bun:test"
import { commentScope } from "../../diff-rows/comment-scope"
import { diffFile, doc, code, mappingOf, middleDivider } from "../../diff-rows/fixtures"
import { RowLineSource } from "../../diff-rows/row-source"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { chatPositionOf, EXCERPT_RADIUS } from "./position-of"

const small = diffFile("s.ts", ["@@ -1,6 +1,5 @@", " a", "-b", "-c", "+B", "+C", " d", "-gone", " e"])
const smallMapping = new DiffLineMapping([small], "all")

const at = (mapping: DiffLineMapping, content: string) =>
  mapping.allLines.findIndex((line) => line.content === content)

const cursor = (line: number, selectionAnchor: number | null = null): VimCursorState => ({
  ...createCursorState(),
  line,
  mode: selectionAnchor === null ? "normal" : "visual-line",
  selectionAnchor,
})

/** As the app builds it: the split view's rows in a pane, or unified's plain span. */
const positionOf = (
  mapping: DiffLineMapping,
  vim: VimCursorState,
  files = [small],
  pane?: "left" | "right",
) => {
  const rows = pane ? new RowLineSource(mapping, "split", pane) : null
  return chatPositionOf({ mapping, vim, scope: commentScope(vim, rows), files })
}

const positionAt = (content: string, pane?: "left" | "right", mapping = smallMapping, files = [small]) =>
  positionOf(mapping, cursor(at(mapping, content)), files, pane)

describe("chatPositionOf", () => {
  test("an added line is on the new side, inside its hunk, with the cursor on it in the excerpt", () => {
    const position = positionAt("B")!
    expect(position).toMatchObject({ path: "s.ts", side: "new", line: 2, label: "s.ts:2", hunkHeader: "@@ -1,6 +1,5 @@" })
    expect(position.excerpt[position.cursorIndex!]).toEqual({ kind: "added", text: "B", newLine: 2 })
    expect(position.excerpt.map((line) => line.text)).toEqual(["a", "b", "c", "B", "C", "d", "gone", "e"])
  })

  test("a removed line in unified is on the old side and says so in its label", () => {
    expect(positionAt("gone")).toMatchObject({ side: "old", line: 5, label: "s.ts:5 (old)" })
  })

  test("a context line in split takes its side from the pane", () => {
    expect(positionAt("e", "left")).toMatchObject({ side: "old", line: 6, label: "s.ts:6 (old)" })
    expect(positionAt("e", "right")).toMatchObject({ side: "new", line: 5, label: "s.ts:5" })
  })

  test("expanded context is a position like any other, outside every hunk", () => {
    const mapping = mappingOf({ expandedDividers: new Set([middleDivider]) })
    const position = positionAt("middle two", undefined, mapping, [doc, code])!
    expect(position).toMatchObject({ path: "doc.md", side: "new", line: 8, label: "doc.md:8" })
    expect(position.hunkHeader).toBeUndefined()
    expect(position.excerpt[position.cursorIndex!]).toMatchObject({ kind: "context", text: "middle two", newLine: 8 })
  })

  test("a file header or a divider is the file alone", () => {
    const mapping = mappingOf()
    const header = mapping.allLines.findIndex((line) => line.type === "file-header" && line.filename === "b.ts")
    expect(positionOf(mapping, cursor(header), [doc, code])).toEqual({
      path: "b.ts",
      excerpt: [],
      label: "b.ts",
    })
    const divider = mapping.allLines.findIndex((line) => line.type === "divider")
    expect(positionOf(mapping, cursor(divider), [doc, code])).toEqual({
      path: "doc.md",
      excerpt: [],
      label: "doc.md",
    })
  })

  test("the excerpt reaches twenty lines either side and stops at the hunk's divider", () => {
    const body = Array.from({ length: 60 }, (_, i) => ` line ${i + 1}`)
    const tall = diffFile("t.ts", ["@@ -1,60 +1,60 @@", ...body, "@@ -100,2 +100,2 @@", " far 1", " far 2"])
    const mapping = new DiffLineMapping([tall], "all")
    const middle = positionOf(mapping, cursor(at(mapping, "line 30")), [tall])!
    expect(middle.excerpt).toHaveLength(2 * EXCERPT_RADIUS + 1)
    expect(middle.excerpt[0]!.text).toBe("line 10")
    expect(middle.excerpt.at(-1)!.text).toBe("line 50")
    expect(middle.cursorIndex).toBe(EXCERPT_RADIUS)

    const last = positionOf(mapping, cursor(at(mapping, "line 58")), [tall])!
    expect(last.excerpt.at(-1)!.text).toBe("line 60")
    expect(last.excerpt[last.cursorIndex!]!.text).toBe("line 58")
  })

  test("a visual-line selection over three lines carries its range and labels it", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "d"), at(smallMapping, "B")))!
    expect(position).toMatchObject({ side: "new", line: 4, selection: { start: 2, end: 4 }, label: "s.ts:2-4" })
  })

  test("a removed line inside a selection on the new side has no number there and is skipped", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "e"), at(smallMapping, "d")))!
    expect(position).toMatchObject({ side: "new", selection: { start: 4, end: 5 }, label: "s.ts:4-5" })
  })

  test("a selection on the old side says so", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "c"), at(smallMapping, "b")))!
    expect(position).toMatchObject({ side: "old", selection: { start: 2, end: 3 }, label: "s.ts:2-3 (old)" })
  })

  test("a split selection covers only the rows selected, though the mapping holds every removal before the additions", () => {
    // In the right pane the "  }" row's half is empty, so the cursor there holds the removal.
    const cart = diffFile("src/cart.ts", [
      "@@ -1,7 +1,3 @@",
      "-let total = 0",
      "-for (const item of items) {",
      "-  total += item.price",
      "-  }",
      "-return total",
      "+return items.length",
      " }",
      " tail",
    ])
    const mapping = new DiffLineMapping([cart], "all")
    const position = positionOf(mapping, cursor(at(mapping, "}"), at(mapping, "  }")), [cart], "right")!
    expect(position).toMatchObject({ side: "new", line: 2, selection: { start: 2, end: 2 }, label: "src/cart.ts:2-2" })
  })

  test("with no diff on screen there is no position", () => {
    const mapping = new DiffLineMapping([], "all")
    expect(positionOf(mapping, cursor(0), [])).toBeNull()
  })
})
