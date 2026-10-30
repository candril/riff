import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { pairLines } from "./pair-lines"
import { diffFile, mappingOf } from "./fixtures"
import { renderMarkdown } from "../features/rendered-markdown/render"
import { buildRows, lineOf } from "./rows"

// File mode draws no "rest of the file" divider, so the lines are the body alone.
function linesOf(body: string[]) {
  const file = diffFile("f.ts", ["@@ -1,9 +1,9 @@", ...body])
  return new DiffLineMapping([file], "single", 0, { outsideDiff: true }).allLines
}

describe("pairLines", () => {
  test("a context line faces itself", () => {
    expect(pairLines(linesOf([" same"]))).toEqual([{ left: 0, right: 0 }])
  })

  test("a rendered line is the new version alone, so it stands on the right while plain context faces itself", () => {
    const source = "# Title\n\n- fast"
    const readme = diffFile("README.md", ["@@ -1,1 +1,3 @@", " # Title", "+", "+- fast"])
    const plain = diffFile("a.ts", ["@@ -1,1 +1,1 @@", " same"])
    const lines = new DiffLineMapping([readme, plain], "all", undefined, {
      outsideDiff: true,
      fileContents: new Map([["README.md", source]]),
      renderedFiles: new Map([["README.md", renderMarkdown(source)]]),
    }).allLines
    const pairs = pairLines(lines)
    const rendered = lines.flatMap((line, index) => (line.rendered && line.type === "context" ? [index] : []))
    const same = lines.findIndex((line) => line.content === "same")
    expect(rendered).toHaveLength(3)
    for (const index of rendered) expect(pairs).toContainEqual({ right: index })
    expect(pairs).toContainEqual({ left: same, right: same })

    // An empty left half reads as the right one, and every row keeps its own key.
    const rows = buildRows(lines, "split")
    const renderedRows = rows.filter((row) => row.kind === "pair" && rendered.includes(row.right!))
    expect(renderedRows.map((row) => lineOf(row, "left"))).toEqual(rendered)
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
  })

  test("two removals against three additions leave the last addition facing nothing", () => {
    const lines = linesOf(["-a", "-b", "+A", "+B", "+C"])
    expect(pairLines(lines)).toEqual([{ left: 0, right: 2 }, { left: 1, right: 3 }, { right: 4 }])
  })

  test("three removals against one addition leave the last two removals facing nothing", () => {
    const lines = linesOf(["-a", "-b", "-c", "+A"])
    expect(pairLines(lines)).toEqual([{ left: 0, right: 3 }, { left: 1 }, { left: 2 }])
  })

  test("additions with no removal before them stand on the right alone", () => {
    expect(pairLines(linesOf([" x", "+A", "+B"]))).toEqual([
      { left: 0, right: 0 },
      { right: 1 },
      { right: 2 },
    ])
  })

  test("removals with no addition after them stand on the left alone", () => {
    expect(pairLines(linesOf(["-a", "-b", " x"]))).toEqual([
      { left: 0 },
      { left: 1 },
      { left: 2, right: 2 },
    ])
  })

  test("a file header, a divider and the spacing between files span both sides", () => {
    const lines = mappingOf().allLines
    const pairs = pairLines(lines)
    for (const type of ["file-header", "divider", "spacing"] as const) {
      const index = lines.findIndex((line) => line.type === type)
      expect(pairs).toContainEqual({ full: index })
    }
  })

  test("a missing newline after a removal stays left and leaves the pairing alone", () => {
    const lines = linesOf(["-a", "-b", "\\ No newline at end of file", "+A", "+B"])
    expect(pairLines(lines)).toEqual([
      { left: 0, right: 3 },
      { left: 1, right: 4 },
      { left: 2 },
    ])
  })

  test("a missing newline after an addition stays right", () => {
    const lines = linesOf(["-a", "+A", "\\ No newline at end of file"])
    expect(pairLines(lines)).toEqual([{ left: 0, right: 1 }, { right: 2 }])
  })

  test("a missing newline after context spans both sides", () => {
    expect(pairLines(linesOf([" x", "\\ No newline at end of file"]))).toEqual([
      { left: 0, right: 0 },
      { full: 1 },
    ])
  })
})
