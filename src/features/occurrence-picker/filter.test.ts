import { describe, expect, test } from "bun:test"
import type { OccurrenceRow } from "./corpus"
import { findOccurrences } from "./filter"
import { excerpt } from "../../components/OccurrencePicker"

function row(filename: string, lineNum: number, text: string): OccurrenceRow {
  return { fileIndex: 0, filename, kind: "addition", lineNum, side: "RIGHT", text }
}

const rows = [
  row("a.ts", 1, "const hunk = parseHunk(line)"),
  row("a.ts", 2, "nothing here"),
  row("a.ts", 3, "if (!PARSEHUNK(raw)) continue"),
  row("b.ts", 7, "export function parseHunk(line: string) {"),
]

describe("findOccurrences", () => {
  test("groups matching rows by file, one hit per row", () => {
    const results = findOccurrences(rows, "parsehunk")
    expect(results.total).toBe(3)
    expect(results.fileCount).toBe(2)
    expect(results.groups.map((g) => [g.filename, g.count, g.hits.map((h) => h.row.lineNum)])).toEqual([
      ["a.ts", 2, [1, 3]],
      ["b.ts", 1, [7]],
    ])
    expect(results.hits[0]).toMatchObject({ startCol: 13, endCol: 22 })
  })

  test("a lowercase query ignores case, an uppercase letter makes it exact", () => {
    expect(findOccurrences(rows, "parsehunk").hits.map((h) => h.row.lineNum)).toEqual([1, 3, 7])
    expect(findOccurrences(rows, "parseHunk").hits.map((h) => h.row.lineNum)).toEqual([1, 7])
    expect(findOccurrences(rows, "PARSEHUNK").hits.map((h) => h.row.lineNum)).toEqual([3])
  })

  test("matches literally, as `/` does", () => {
    expect(findOccurrences(rows, "(line").total).toBe(2)
    expect(findOccurrences(rows, "p.rseHunk").total).toBe(0)
  })

  test("an empty query lists nothing", () => {
    expect(findOccurrences(rows, "").hits).toEqual([])
  })

  test("stops listing at the cap but still counts everything", () => {
    const results = findOccurrences(rows, "e", 2)
    expect(results.hits.length).toBe(2)
    expect(results.total).toBe(4)
    expect(results.capped).toBe(true)
    expect(results.fileCount).toBe(2)
    expect(results.groups.map((g) => g.filename)).toEqual(["a.ts"])
  })
})

describe("excerpt", () => {
  test("drops indentation before the match", () => {
    expect(excerpt("    foo(bar)", 8, 11)).toEqual({ before: "foo(", match: "bar", after: ")" })
  })

  test("brings a far-right match into view", () => {
    const text = `${"x".repeat(100)}needle`
    const { before, match } = excerpt(text, 100, 106)
    expect(before.startsWith("…")).toBe(true)
    expect(before.length).toBe(48)
    expect(match).toBe("needle")
  })
})
