import { describe, expect, test } from "bun:test"
import { diffFile, doc, code, mappingOf, middleDivider } from "../../diff-rows/fixtures"
import { RowLineSource } from "../../diff-rows/row-source"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { blameTargetOf } from "./target"

const small = diffFile("s.ts", ["@@ -1,6 +1,5 @@", " a", "-b", "-c", "+B", "+C", " d", "-gone", " e"])
const smallMapping = new DiffLineMapping([small], "all")

const at = (mapping: DiffLineMapping, content: string) =>
  mapping.allLines.findIndex((line) => line.content === content)

const targetAt = (content: string, pane?: "left" | "right", mapping = smallMapping, files = [small]) =>
  blameTargetOf({
    mapping,
    vim: { line: at(mapping, content) },
    rows: pane ? new RowLineSource(mapping, "split", pane) : null,
    files,
  })

describe("blameTargetOf", () => {
  test("an added line is blamed in the head by its new number", () => {
    expect(targetAt("B")).toEqual({ path: "s.ts", side: "head", line: 2 })
  })

  test("a removed line is blamed in the base by its old number", () => {
    expect(targetAt("gone")).toEqual({ path: "s.ts", side: "base", line: 5 })
  })

  test("a context line is blamed in the head by its new number", () => {
    expect(targetAt("e")).toEqual({ path: "s.ts", side: "head", line: 5 })
  })

  test("on a renamed file the base is blamed under the old name, the head under the new", () => {
    const moved = { ...diffFile("new.ts", small.content.split("\n").slice(3)), status: "renamed" as const, oldFilename: "old.ts" }
    const mapping = new DiffLineMapping([moved], "all")
    const files = [moved]
    expect(targetAt("gone", undefined, mapping, files)).toEqual({ path: "old.ts", side: "base", line: 5 })
    expect(targetAt("b", "left", mapping, files)).toEqual({ path: "old.ts", side: "base", line: 2 })
    expect(targetAt("B", undefined, mapping, files)).toEqual({ path: "new.ts", side: "head", line: 2 })
    expect(targetAt("e", undefined, mapping, files)).toEqual({ path: "new.ts", side: "head", line: 5 })
  })

  test("expanded context is blamed like any context line", () => {
    const mapping = mappingOf({ expandedDividers: new Set([middleDivider]) }, [doc, code])
    expect(mapping.getLine(at(mapping, "middle two"))?.expanded).toBe(true)
    expect(targetAt("middle two", undefined, mapping, [doc, code])).toEqual({ path: "doc.md", side: "head", line: 8 })
  })

  test("a modified split row is blamed in the base from the left pane and in the head from the right", () => {
    // The cursor sits on the removal, as it does after moving onto the row in the left pane.
    expect(targetAt("b", "left")).toEqual({ path: "s.ts", side: "base", line: 2 })
    expect(targetAt("b", "right")).toEqual({ path: "s.ts", side: "head", line: 2 })
  })

  test("an empty split half has nothing to blame", () => {
    // "gone" pairs with nothing on the right.
    expect(targetAt("gone", "right")).toBeNull()
  })

  test("a divider, a file header and a hunk header have nothing to blame", () => {
    const two = diffFile("t.ts", ["@@ -1,1 +1,1 @@", " top", "@@ -50,1 +50,1 @@", " far"])
    const mapping = new DiffLineMapping([two], "all")
    const divider = mapping.allLines.findIndex((line) => line.type === "divider")
    const fileHeader = mapping.allLines.findIndex((line) => line.type === "file-header")
    expect(blameTargetOf({ mapping, vim: { line: divider }, rows: null, files: [two] })).toBeNull()
    expect(blameTargetOf({ mapping, vim: { line: divider }, rows: new RowLineSource(mapping, "split", "left"), files: [two] })).toBeNull()
    expect(blameTargetOf({ mapping, vim: { line: fileHeader }, rows: null, files: [two] })).toBeNull()

    // The mapping draws dividers in place of hunk headers now, so a header only arrives from a stub.
    const hunkHeader = { type: "hunk-header", filename: "t.ts", oldLineNum: 50, newLineNum: 50 }
    const withHeader = { getLine: () => hunkHeader } as unknown as DiffLineMapping
    expect(blameTargetOf({ mapping: withHeader, vim: { line: 0 }, rows: null, files: [two] })).toBeNull()
  })
})
