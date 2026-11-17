import { describe, expect, test } from "bun:test"
import { parseDiff } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { CONVERSION } from "./fixtures"
import { findPairs, lineDiff, pairedRows } from "./pairing"

describe("lineDiff", () => {
  test("removals come before the additions of the same stretch", () => {
    expect(lineDiff(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { kind: "equal", old: 0, new: 0 },
      { kind: "delete", old: 1 },
      { kind: "insert", new: 1 },
      { kind: "equal", old: 2, new: 2 },
    ])
  })

  test("a longest common run survives lines moving round it", () => {
    const ops = lineDiff(["a", "b", "c", "d"], ["b", "c", "a", "d"])!
    expect(ops.filter((op) => op.kind === "equal").length).toBe(3)
  })
})

describe("a document turning into its diff", () => {
  const files = parseDiff(CONVERSION)

  test("the deleted file pairs with the added .diff of the same name", () => {
    expect([...findPairs(files)].map(([original, nested]) => [original, nested.filename])).toEqual([
      ["Fetch.md", "Fetch.md.diff"],
    ])
  })

  test("the old file is compared with the inner new side, numbered as the .diff's lines", () => {
    const paired = pairedRows(files[0]!, files[1]!)!
    expect(paired.label).toBe("contract")
    expect(paired.rows).toEqual([
      { type: "context", content: "# Fetch", oldLineNum: 1, newLineNum: 3 },
      { type: "context", content: "", oldLineNum: 2, newLineNum: 4 },
      { type: "deletion", content: "`GET /new` [D1](#deviations)", oldLineNum: 3 },
      { type: "deletion", content: "", oldLineNum: 4 },
      { type: "deletion", content: "## Deviations", oldLineNum: 5 },
      { type: "deletion", content: "| D1 | old route |", oldLineNum: 6 },
      { type: "addition", content: "`GET /new`", newLineNum: 6 },
    ])
  })

  test("the inner @@ line is no line of the document", () => {
    const patch = parseDiff(CONVERSION.replace("++++ contract\n", "++++ contract\n+@@ -1,4 +1,4 @@\n"))
    expect(pairedRows(patch[0]!, patch[1]!)!.rows).toEqual([
      { type: "context", content: "# Fetch", oldLineNum: 1, newLineNum: 4 },
      { type: "context", content: "", oldLineNum: 2, newLineNum: 5 },
      { type: "deletion", content: "`GET /new` [D1](#deviations)", oldLineNum: 3 },
      { type: "deletion", content: "", oldLineNum: 4 },
      { type: "deletion", content: "## Deviations", oldLineNum: 5 },
      { type: "deletion", content: "| D1 | old route |", oldLineNum: 6 },
      { type: "addition", content: "`GET /new`", newLineNum: 7 },
    ])
  })

  test("a diff that is not the whole file pairs nothing", () => {
    const partial = { ...files[0]!, content: files[0]!.content.replace("@@ -1,6 +0,0 @@", "@@ -3,6 +0,0 @@") }
    expect(pairedRows(partial, files[1]!)).toBeNull()
  })

  describe("in the mapping", () => {
    const mapping = new DiffLineMapping(files, "all")
    const rowOf = (content: string, type: string) =>
      mapping.allLines.findIndex((line) => line.filename === "Fetch.md" && line.content === content && line.type === type)

    test("the deleted file's header names what it is drawn against", () => {
      expect(mapping.allLines[0]).toMatchObject({ pairedFile: "Fetch.md.diff", pairedLabel: "contract" })
    })

    test("a removal anchors to the old file, an addition to the .diff", () => {
      expect(mapping.getCommentAnchor(rowOf("## Deviations", "deletion"))).toMatchObject({
        filename: "Fetch.md",
        side: "LEFT",
        line: 5,
      })
      expect(mapping.getCommentAnchor(rowOf("`GET /new`", "addition"))).toMatchObject({
        filename: "Fetch.md.diff",
        side: "RIGHT",
        line: 6,
      })
    })

    test("context anchors to the file of the half it is written in", () => {
      const heading = rowOf("# Fetch", "context")
      expect(mapping.getCommentAnchor(heading, "left")).toMatchObject({ filename: "Fetch.md", side: "LEFT", line: 1 })
      expect(mapping.getCommentAnchor(heading, "right")).toMatchObject({ filename: "Fetch.md.diff", side: "RIGHT", line: 3 })
    })

    test("raw, the deleted file is its plain deletion", () => {
      const raw = new DiffLineMapping(files, "all", undefined, { rawNestedFiles: new Set(["Fetch.md"]) })
      const rows = raw.allLines.filter((line) => line.filename === "Fetch.md" && line.oldLineNum !== undefined)
      expect(rows.map((line) => line.type)).toEqual(Array(6).fill("deletion"))
      expect(rows.some((line) => line.pairedFile)).toBe(false)
      expect(raw.allLines[0]!.pairedFile).toBeUndefined()
    })

    test("with the .diff itself raw, there is no inner side to compare with", () => {
      const raw = new DiffLineMapping(files, "all", undefined, { rawNestedFiles: new Set(["Fetch.md.diff"]) })
      expect(raw.isPaired("Fetch.md")).toBe(false)
    })
  })
})
