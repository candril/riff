import { describe, expect, test } from "bun:test"
import { parseDiff } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { DiffLine } from "../../vim-diff/types"
import { ADDED_NESTED, MODIFIED_NESTED } from "./fixtures"
import { innerFilename, isNestedDiffFile } from "./nest"

const contentRows = (mapping: DiffLineMapping) =>
  mapping.allLines.filter((line) => line.type === "context" || line.type === "addition" || line.type === "deletion")

const shape = (line: DiffLine) => [line.inner, line.content, line.outerChange ?? null]

describe("which files are nested", () => {
  test("a .diff or a .patch file, by name", () => {
    expect(isNestedDiffFile("docs/Fetch.md.diff")).toBe(true)
    expect(isNestedDiffFile("patches/fix.PATCH")).toBe(true)
    expect(isNestedDiffFile("src/diff.ts")).toBe(false)
  })

  test("the inner file is the name without the extension", () => {
    expect(innerFilename("docs/Fetch.md.diff")).toBe("docs/Fetch.md")
    expect(innerFilename("vendor/x.ts.patch")).toBe("vendor/x.ts")
  })
})

describe("an added nested file", () => {
  const mapping = new DiffLineMapping(parseDiff(ADDED_NESTED), "all", undefined, { alignMarkdownTables: false })

  test("each line is read for what it is in the diff it contains, its marker gone", () => {
    expect(contentRows(mapping).map(shape)).toEqual([
      ["old-header", "--- observed", null],
      ["new-header", "+++ contract", null],
      ["context", "# Fetch", null],
      // An editor strips the space an empty context line starts with.
      ["context", "", null],
      ["deletion", "`GET /old`", null],
      ["addition", "`GET /new`", null],
      ["context", "| a | b |", null],
      ["deletion", "Errors: none", null],
    ])
  })

  test("the rows stay the outer diff's: its type, its numbers, and the file's own text", () => {
    const route = contentRows(mapping)[5]!
    expect(route.type).toBe("addition")
    expect(route.newLineNum).toBe(6)
    expect(route.sourceContent).toBe("+`GET /new`")
  })

  test("the header says the file is read nested", () => {
    expect(mapping.allLines[0]).toMatchObject({ type: "file-header", nested: true })
  })

  test("raw, the file is its plain diff", () => {
    const raw = new DiffLineMapping(parseDiff(ADDED_NESTED), "all", undefined, {
      rawNestedFiles: new Set(["Fetch.md.diff"]),
    })
    expect(raw.allLines.some((line) => line.inner !== undefined || line.nested)).toBe(false)
    expect(contentRows(raw)[0]!.content).toBe("--- observed")
  })
})

describe("a modified nested file", () => {
  const mapping = new DiffLineMapping(parseDiff(MODIFIED_NESTED), "all", undefined, { alignMarkdownTables: false })

  test("a line the review changed carries the change; the rest carry none", () => {
    expect(contentRows(mapping).map(shape)).toEqual([
      ["context", "# Fetch", null],
      ["context", "", null],
      ["deletion", "`GET /old`", null],
      ["addition", "`GET /new`", "deletion"],
      ["addition", "`GET /newer`", "addition"],
      ["context", "| a | b |", null],
      ["deletion", "Errors: none", "deletion"],
      ["context", "Errors: none", "addition"],
    ])
  })

  test("a comment anchors where the line is in the file under review, whichever half it is written in", () => {
    const rows = mapping.allLines
    const observedOnly = rows.findIndex((line) => line.inner === "deletion" && line.type === "context")
    // Drawn in the left half, but the line is on both versions of the file: RIGHT, as context is.
    expect(mapping.getCommentAnchor(observedOnly, "left")).toMatchObject({ side: "RIGHT", line: 5 })
    const added = rows.findIndex((line) => line.content === "`GET /newer`")
    expect(mapping.getCommentAnchor(added, "right")).toMatchObject({ side: "RIGHT", line: 6 })
    const removed = rows.findIndex((line) => line.content === "Errors: none" && line.type === "deletion")
    // An inner removal of a line the review removed: drawn left, and LEFT in the file.
    expect(mapping.getCommentAnchor(removed, "left")).toMatchObject({ side: "LEFT", line: 8 })
  })
})

describe("header pairs", () => {
  const nested = (...rows: string[]) =>
    new DiffLineMapping(
      parseDiff(
        ["diff --git a/x.diff b/x.diff", "new file mode 100644", "--- /dev/null", "+++ b/x.diff", `@@ -0,0 +1,${rows.length} @@`, ...rows.map((row) => `+${row}`)].join("\n"),
      ),
      "all",
    )

  test("a --- line alone is the removal of a line starting --", () => {
    expect(contentRows(nested("--- comment", " kept")).map((line) => line.inner)).toEqual(["deletion", "context"])
  })

  test("diff --git, index and @@ lines keep their text as the inner diff's chrome", () => {
    const rows = contentRows(nested("diff --git a/y b/y", "index 1..2", "--- a/y", "+++ b/y", "@@ -1 +1 @@", "-a", "+b"))
    expect(rows.map((line) => [line.inner, line.content])).toEqual([
      ["meta", "diff --git a/y b/y"],
      ["meta", "index 1..2"],
      ["old-header", "--- a/y"],
      ["new-header", "+++ b/y"],
      ["meta", "@@ -1 +1 @@"],
      ["deletion", "a"],
      ["addition", "b"],
    ])
  })
})

test("a nested markdown file's tables line up, and the row still knows the file's own text", () => {
  const raw = [
    "diff --git a/t.md.diff b/t.md.diff",
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/t.md.diff",
    "@@ -0,0 +1,3 @@",
    "+ | a | b |",
    "+-| long cell | x |",
    "++| c | y |",
  ].join("\n")
  const rows = contentRows(new DiffLineMapping(parseDiff(raw), "all"))
  expect(rows.map((line) => line.content)).toEqual(["| a         | b |", "| long cell | x |", "| c         | y |"])
  expect(rows.map((line) => line.sourceContent)).toEqual([" | a | b |", "-| long cell | x |", "+| c | y |"])
})
