import { describe, expect, test } from "bun:test"
import { renderMarkdown } from "../features/rendered-markdown/render"
import type { DiffFile } from "../utils/diff-parser"
import { DiffLineMapping } from "./line-mapping"
import type { RenderedLine } from "./types"

const readmeSource = [
  "# shop", // 1
  "", // 2
  "Intro", // 3
  "", // 4
  "## Shipping", // 5
  "", // 6
  "- fast", // 7
  "- cheap", // 8
  "", // 9
  "| a | b |", // 10
  "|---|---|", // 11
  "| 1 | 22 |", // 12
].join("\n")

const readme: DiffFile = {
  filename: "README.md",
  additions: 4,
  deletions: 0,
  status: "modified",
  content: [
    "diff --git a/README.md b/README.md",
    "--- a/README.md",
    "+++ b/README.md",
    "@@ -3,3 +3,7 @@",
    " Intro",
    " ",
    "+## Shipping",
    "+",
    "+- fast",
    "+- cheap",
    " ",
  ].join("\n"),
}

const code: DiffFile = {
  filename: "src/a.ts",
  additions: 1,
  deletions: 1,
  status: "modified",
  content: ["diff --git a/src/a.ts b/src/a.ts", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1 +1 @@", "-old", "+new"].join(
    "\n"
  ),
}

function mapping(mode: "single" | "all", rows: readonly RenderedLine[] = renderMarkdown(readmeSource)) {
  return new DiffLineMapping([readme, code], mode, mode === "single" ? 0 : undefined, {
    fileContents: new Map([[readme.filename, readmeSource]]),
    renderedFiles: new Map([[readme.filename, rows]]),
  })
}

const readmeRows = (map: DiffLineMapping) =>
  map.allLines.filter((line) => line.filename === readme.filename && line.type !== "file-header" && line.type !== "spacing")

describe("a rendered markdown file in the mapping", () => {
  test("its rendered rows replace its hunks in single-file mode", () => {
    const rows = mapping("single").allLines
    expect(rows.map((row) => row.content)).toEqual(renderMarkdown(readmeSource).map((row) => row.text))
    expect(rows.every((row) => row.type === "context" && row.rendered === true)).toBe(true)
    expect(rows.some((row) => row.content === "## Shipping")).toBe(false)
  })

  test("its rendered rows replace its hunks in all-files mode, and the other file keeps its diff", () => {
    const map = mapping("all")
    expect(readmeRows(map).map((row) => row.content)).toContain("Shipping")
    expect(readmeRows(map).every((row) => row.rendered === true)).toBe(true)
    const other = map.allLines.filter((line) => line.filename === code.filename)
    expect(other.map((line) => line.type)).toEqual(["file-header", "deletion", "addition", "divider"])
    expect(other.some((line) => line.rendered)).toBe(false)
  })

  test("each row counts on the new side at its source line, and has no old side", () => {
    const rows = mapping("single").allLines
    expect(rows.map((row) => row.newLineNum)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(rows.every((row) => row.oldLineNum === undefined)).toBe(true)
    const shipping = rows.find((row) => row.content === "Shipping")!
    expect(shipping.sourceContent).toBe("## Shipping")
    expect(shipping.rawLine).toBe(" ## Shipping")
    expect(shipping.fileIndex).toBe(0)
    expect(shipping.filename).toBe("README.md")
  })

  test("a row inside the diff's hunks is not expanded, one outside is", () => {
    const rows = mapping("single").allLines
    const expanded = rows.filter((row) => row.expanded).map((row) => row.newLineNum)
    expect(expanded).toEqual([1, 2, 10, 11, 12])
  })

  test("the file header says the file is rendered", () => {
    const headers = mapping("all").allLines.filter((line) => line.type === "file-header")
    expect(headers.map((header) => [header.filename, header.rendered])).toEqual([
      ["README.md", true],
      ["src/a.ts", undefined],
    ])
  })

  test("a comment on a rendered row anchors to its source line on the new side", () => {
    const map = mapping("single")
    const shipping = map.allLines.findIndex((row) => row.content === "Shipping")
    expect(map.getCommentAnchor(shipping)).toEqual({ filename: "README.md", line: 5, side: "RIGHT", note: false })
    expect(map.getCommentAnchor(0)).toEqual({ filename: "README.md", line: 1, side: "RIGHT", note: true })
  })

  test("a comment's line finds the first row rendered from it", () => {
    const rows: RenderedLine[] = [
      { text: "a", sourceLine: 1, spans: [] },
      { text: "b", sourceLine: 3, spans: [] },
      { text: "c", sourceLine: 3, spans: [] },
    ]
    const map = mapping("single", rows)
    expect(map.findLineForComment({ filename: "README.md", line: 3, side: "RIGHT" })).toBe(1)
  })

  test("a drawn diagram's rows carry their part and last line, and its fence's comment finds the first", () => {
    const rows: RenderedLine[] = [
      { text: "a", sourceLine: 1, spans: [] },
      { text: "┌─┐", sourceLine: 3, spans: [], part: 0, lastLine: 6 },
      { text: "└─┘", sourceLine: 3, spans: [], part: 1, lastLine: 6 },
      { text: "b", sourceLine: 7, spans: [] },
    ]
    const lines = mapping("single", rows).allLines
    expect(lines.map((line) => [line.renderedPart, line.renderedLastLine])).toEqual([
      [undefined, undefined],
      [0, 6],
      [1, 6],
      [undefined, undefined],
    ])
    expect(mapping("single", rows).findLineForComment({ filename: "README.md", line: 3, side: "RIGHT" })).toBe(1)
  })

  test("rendered rows carry their spans", () => {
    const shipping = mapping("single").allLines.find((row) => row.content === "Shipping")!
    expect(shipping.renderedSpans).toEqual([[0, 8, "markup.heading.2"]])
  })

  test("table alignment leaves rendered rows as they were rendered", () => {
    const rows: RenderedLine[] = [
      { text: "| a | bb |", sourceLine: 10, spans: [] },
      { text: "|-|-|", sourceLine: 11, spans: [] },
    ]
    const lines = mapping("single", rows).allLines
    expect(lines.map((line) => line.content)).toEqual(["| a | bb |", "|-|-|"])
    expect(lines.map((line) => line.sourceContent)).toEqual(["| a | b |", "|---|---|"])
  })
})
