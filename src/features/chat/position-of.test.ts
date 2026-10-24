import { describe, expect, test } from "bun:test"
import { commentScope } from "../../diff-rows/comment-scope"
import { diffFile, doc, code, fenceId, mappingOf, middleDivider } from "../../diff-rows/fixtures"
import { RowLineSource } from "../../diff-rows/row-source"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { chatPositionOf, EXCERPT_RADIUS } from "./position-of"

const small = diffFile("s.ts", ["@@ -1,6 +1,5 @@", " a", "-b", "-c", "+B", "+C", " d", "-gone", " e"])
const smallMapping = new DiffLineMapping([small], "all")

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
  return chatPositionOf({ mapping, vim, scope: commentScope(vim, rows), files, rows })
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

  test("a unified context row carries its old line, which a split pane or an added row does not", () => {
    expect(positionAt("e")).toMatchObject({ side: "new", line: 5, oldLine: 6 })
    expect(positionAt("B")!.oldLine).toBeUndefined()
    expect(positionAt("e", "right")!.oldLine).toBeUndefined()
    expect(positionAt("e", "left")!.oldLine).toBeUndefined()
  })

  test("a unified selection carries no old line", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "e"), at(smallMapping, "d")))!
    expect(position.selection).toBeDefined()
    expect(position.oldLine).toBeUndefined()
  })

  test("expanded context is a position like any other, outside every hunk", () => {
    const mapping = mappingOf({ expandedDividers: new Set([middleDivider]) })
    const position = positionAt("middle two", undefined, mapping, [doc, code])!
    expect(position).toMatchObject({ path: "doc.md", side: "new", line: 8, label: "doc.md:8" })
    expect(position.hunkHeader).toBeUndefined()
    expect(position.excerpt[position.cursorIndex!]).toMatchObject({ kind: "context", text: "middle two", newLine: 8 })
  })

  test("a file header, or a divider with no hunk below it, is the file alone", () => {
    const mapping = mappingOf()
    const header = mapping.allLines.findIndex((line) => line.type === "file-header" && line.filename === "b.ts")
    expect(positionOf(mapping, cursor(header), [doc, code])).toEqual({
      path: "b.ts",
      excerpt: [],
      label: "b.ts",
    })
    const last = mapping.allLines.findLastIndex((line) => line.type === "divider")
    expect(positionOf(mapping, cursor(last), [doc, code])).toEqual({
      path: "b.ts",
      excerpt: [],
      label: "b.ts",
    })
  })

  test("a divider above a hunk is that hunk: its header and its first lines, on no line of its own", () => {
    const body = Array.from({ length: 30 }, (_, i) => ` line ${i + 1}`)
    const two = diffFile("t.ts", ["@@ -1,1 +1,1 @@", " top", "@@ -50,30 +50,30 @@", ...body])
    const mapping = new DiffLineMapping([two], "all")
    const divider = mapping.allLines.findIndex((line) => line.type === "divider")
    for (const pane of [undefined, "left", "right"] as const) {
      const position = positionOf(mapping, cursor(divider), [two], pane)!
      expect(position).toEqual({
        path: "t.ts",
        hunkHeader: "@@ -50,30 +50,30 @@",
        excerpt: position.excerpt,
        label: "t.ts",
      })
      expect(position.excerpt).toHaveLength(EXCERPT_RADIUS + 1)
      expect(position.excerpt[0]).toEqual({ kind: "context", text: "line 1", oldLine: 50, newLine: 50 })
    }
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

  test("a unified selection from a removed row down to an added row carries the removed rows' old numbers", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "B"), at(smallMapping, "b")))!
    expect(position).toMatchObject({ side: "new", selection: { start: 2, end: 2 }, otherSelection: { start: 2, end: 3 } })
  })

  test("a split selection carries no other side", () => {
    const mapping = new DiffLineMapping([small], "all")
    for (const pane of ["left", "right"] as const) {
      const position = positionOf(mapping, cursor(at(mapping, "B"), at(mapping, "b")), [small], pane)!
      expect(position.selection).toBeDefined()
      expect(position.otherSelection).toBeUndefined()
    }
  })

  test("a selection on the old side says so", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "c"), at(smallMapping, "b")))!
    expect(position).toMatchObject({ side: "old", selection: { start: 2, end: 3 }, label: "s.ts:2-3 (old)" })
  })

  test("a split selection covers only the rows selected, though the mapping holds every removal before the additions", () => {
    const mapping = new DiffLineMapping([cart], "all")
    const position = positionOf(mapping, cursor(at(mapping, "}"), at(mapping, "  }")), [cart], "right")!
    expect(position).toMatchObject({ side: "new", line: 2, selection: { start: 2, end: 2 }, label: "src/cart.ts:2" })
  })

  test("a one-line selection is labelled with its line alone", () => {
    const position = positionOf(smallMapping, cursor(at(smallMapping, "gone"), at(smallMapping, "gone")))!
    expect(position).toMatchObject({ selection: { start: 5, end: 5 }, label: "s.ts:5 (old)" })
  })

  test("an empty right half takes the nearest row with a new line, and the selection is still read from the pane", () => {
    const mapping = new DiffLineMapping([cart], "all")
    const position = positionOf(mapping, cursor(at(mapping, "  }"), at(mapping, "}")), [cart], "right")!
    expect(position).toMatchObject({
      path: "src/cart.ts",
      side: "new",
      line: 2,
      hunkHeader: "@@ -1,7 +1,3 @@",
      selection: { start: 2, end: 2 },
      label: "src/cart.ts:2",
    })
    expect(position.excerpt[position.cursorIndex!]).toEqual({ kind: "context", text: "}", oldLine: 6, newLine: 2 })
  })

  test("an empty left half in a run of additions takes the nearest old line", () => {
    const added = diffFile("a.ts", ["@@ -1,2 +1,5 @@", " a", "+x", "+y", "+z", " b"])
    const mapping = new DiffLineMapping([added], "all")
    const position = positionOf(mapping, cursor(at(mapping, "z")), [added], "left")!
    expect(position).toMatchObject({ side: "old", line: 2, label: "a.ts:2 (old)" })
    expect(position.excerpt[position.cursorIndex!]).toMatchObject({ text: "b" })
  })

  test("rows equally near above and below give the one above", () => {
    expect(positionAt("gone", "right")).toMatchObject({ side: "new", line: 4, label: "s.ts:4" })
  })

  test("an empty half takes the nearest line in its own hunk, never one across a divider", () => {
    const w = diffFile("w.ts", ["@@ -1,1 +1,1 @@", " a", "@@ -40,3 +40,1 @@", "-x", "-y", "-z", " k"])
    const mapping = new DiffLineMapping([w], "all")
    const position = positionOf(mapping, cursor(at(mapping, "x")), [w], "right")!
    expect(position).toMatchObject({ side: "new", line: 40, label: "w.ts:40", hunkHeader: "@@ -40,3 +40,1 @@" })
    expect(position.excerpt[position.cursorIndex!]).toMatchObject({ text: "k" })
  })

  test("a hunk with no line in the pane is the file alone, though the hunk above has one", () => {
    const r = diffFile("r.ts", ["@@ -1,1 +1,1 @@", " a", "@@ -40,2 +39,0 @@", "-x", "-y"])
    const mapping = new DiffLineMapping([r], "all")
    expect(positionOf(mapping, cursor(at(mapping, "y")), [r], "right")).toEqual({
      path: "r.ts",
      excerpt: [],
      label: "r.ts",
    })
  })

  test("a folded block is the file alone in unified and in either split pane", () => {
    const mapping = mappingOf({ collapsedBlocks: new Set([fenceId()]) })
    const fold = mapping.allLines.findIndex((line) => line.filename === "doc.md" && line.blockFoldId)
    expect(fold).toBeGreaterThanOrEqual(0)
    for (const pane of [undefined, "left", "right"] as const) {
      expect(positionOf(mapping, cursor(fold), [doc, code], pane)).toEqual({
        path: "doc.md",
        excerpt: [],
        label: "doc.md",
      })
    }
  })

  test("a cursor on a divider with a selection above it anchors on the selection's hunk", () => {
    const body = Array.from({ length: 5 }, (_, i) => ` line ${i + 1}`)
    const two = diffFile("t.ts", ["@@ -1,2 +1,1 @@", " top", "-old", "@@ -50,5 +50,5 @@", ...body])
    const mapping = new DiffLineMapping([two], "all")
    const divider = mapping.allLines.findIndex((line) => line.type === "divider")
    for (const pane of [undefined, "left"] as const) {
      const position = positionOf(mapping, cursor(divider, at(mapping, "old")), [two], pane)!
      expect(position).toMatchObject({
        path: "t.ts",
        side: "old",
        line: 2,
        hunkHeader: "@@ -1,2 +1,1 @@",
        label: "t.ts:2 (old)",
        selection: { start: 2, end: 2 },
      })
      expect(position.excerpt[position.cursorIndex!]).toMatchObject({ kind: "removed", text: "old" })
    }
  })

  test("selected lines equally near a divider give the one above, in whatever order the scope lists them", () => {
    const two = diffFile("t.ts", ["@@ -1,2 +1,1 @@", " top", "-old", "@@ -50,2 +49,1 @@", "-gone", " keep"])
    const mapping = new DiffLineMapping([two], "all")
    const divider = mapping.allLines.findIndex((line) => line.type === "divider")
    const [above, below] = [at(mapping, "old"), at(mapping, "gone")]
    expect(divider - above).toBe(below - divider)
    const position = chatPositionOf({
      mapping,
      vim: cursor(divider, above),
      scope: { lines: [below, divider, above], pane: "left" },
      files: [two],
      rows: new RowLineSource(mapping, "split", "left"),
    })
    expect(position).toMatchObject({ side: "old", line: 2, hunkHeader: "@@ -1,2 +1,1 @@", label: "t.ts:2-50 (old)" })
  })

  test("with no divider between two hunks, an empty half's walk reaches into the next one", () => {
    const adjacent = diffFile("u.ts", ["@@ -1,2 +0,0 @@", "-a", "-b", "@@ -3,1 +1,1 @@", " c"])
    const mapping = new DiffLineMapping([adjacent], "all")
    expect(mapping.allLines.some((line) => line.type === "divider" && line.content !== "rest of the file")).toBe(false)
    const position = positionOf(mapping, cursor(at(mapping, "b")), [adjacent], "right")!
    expect(position).toMatchObject({ side: "new", line: 1, label: "u.ts:1", hunkHeader: "@@ -3,1 +1,1 @@" })
    expect(position.excerpt[position.cursorIndex!]).toMatchObject({ text: "c" })
  })

  test("a selection reaching a divider from another file leaves the divider's own hunk below", () => {
    const a = diffFile("a.ts", ["@@ -1,2 +1,1 @@", " top", "-old"])
    const b = diffFile("b.ts", ["@@ -50,2 +50,2 @@", " p", " q"])
    const mapping = new DiffLineMapping([a, b], "all")
    const divider = mapping.allLines.findIndex((line) => line.type === "divider" && line.filename === "b.ts")
    for (const pane of [undefined, "left"] as const) {
      expect(positionOf(mapping, cursor(divider, at(mapping, "old")), [a, b], pane)).toEqual({
        path: "b.ts",
        hunkHeader: "@@ -50,2 +50,2 @@",
        excerpt: [
          { kind: "context", text: "p", oldLine: 50, newLine: 50 },
          { kind: "context", text: "q", oldLine: 51, newLine: 51 },
        ],
        label: "b.ts",
      })
    }
  })

  test("a pane with no line anywhere in the file is the file alone", () => {
    const created = diffFile("new.ts", ["@@ -0,0 +1,2 @@", "+x", "+y"])
    const mapping = new DiffLineMapping([created], "all")
    expect(positionOf(mapping, cursor(at(mapping, "y")), [created], "left")).toEqual({
      path: "new.ts",
      excerpt: [],
      label: "new.ts",
    })
  })

  test("with no diff on screen there is no position", () => {
    const mapping = new DiffLineMapping([], "all")
    expect(positionOf(mapping, cursor(0), [])).toBeNull()
  })
})
