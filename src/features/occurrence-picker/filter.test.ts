import { describe, expect, test } from "bun:test"
import type { OccurrenceRow } from "./corpus"
import { findOccurrences } from "./filter"
import { excerpt, type Segment } from "../../components/OccurrencePicker"

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
    const results = findOccurrences(rows, "e", "", 2)
    expect(results.hits.length).toBe(2)
    expect(results.total).toBe(4)
    expect(results.capped).toBe(true)
    expect(results.fileCount).toBe(2)
    expect(results.groups.map((g) => g.filename)).toEqual(["a.ts"])
  })
})

describe("narrowing", () => {
  const lines = (query: string, filter: string) =>
    findOccurrences(rows, query, filter).hits.map((h) => `${h.row.filename}:${h.row.lineNum}`)

  test("a term keeps rows whose path or text contains it", () => {
    expect(lines("parsehunk", "b.ts")).toEqual(["b.ts:7"])
    expect(lines("parsehunk", "const")).toEqual(["a.ts:1"])
  })

  test("every term has to match", () => {
    expect(lines("parsehunk", "a.ts  continue")).toEqual(["a.ts:3"])
    expect(lines("parsehunk", "b.ts continue")).toEqual([])
  })

  test("a `!` term drops rows whose path or text contains it", () => {
    expect(lines("parsehunk", "!b.ts")).toEqual(["a.ts:1", "a.ts:3"])
    expect(lines("parsehunk", "!raw")).toEqual(["a.ts:1", "b.ts:7"])
  })

  test("terms are literal and smart-case", () => {
    expect(lines("parsehunk", "(raw")).toEqual(["a.ts:3"])
    expect(lines("parsehunk", "a.t.")).toEqual([])
    expect(lines("parsehunk", "Const")).toEqual([])
  })

  test("a blank filter or a lone `!` keeps everything", () => {
    expect(lines("parsehunk", "  ! ")).toEqual(["a.ts:1", "a.ts:3", "b.ts:7"])
  })

  test("counts describe the narrowed list", () => {
    const results = findOccurrences(rows, "parsehunk", "a.ts")
    expect(results.total).toBe(2)
    expect(results.fileCount).toBe(1)
  })

  test("the filter alone finds nothing", () => {
    expect(lines("", "a.ts")).toEqual([])
  })
})

describe("narrowing spans", () => {
  test("mark every place a term occurs, in the path and in the row", () => {
    const results = findOccurrences(rows, "parsehunk", "a.ts hunk")
    expect(results.groups[0]!.pathSpans).toEqual([[0, 4]])
    expect(results.hits[0]!.narrowSpans).toEqual([[6, 10], [18, 22]])
  })

  test("a `!term` marks nothing", () => {
    expect(findOccurrences(rows, "parsehunk", "!raw").hits[0]!.narrowSpans).toEqual([])
  })
})

const plain = (segments: Segment[]) => segments.map((s) => [s.text, s.mark])

describe("excerpt", () => {
  test("drops indentation before the match", () => {
    expect(plain(excerpt("    foo(bar)", [8, 11]))).toEqual([
      ["foo(", "plain"],
      ["bar", "match"],
      [")", "plain"],
    ])
  })

  test("brings a far-right match into view", () => {
    const segments = excerpt(`${"x".repeat(100)}needle`, [100, 106])
    expect(segments[0]).toEqual({ text: "…", mark: "plain" })
    expect(segments[1]!.text.length).toBe(47)
    expect(segments[2]).toEqual({ text: "needle", mark: "match" })
  })

  test("marks narrowing terms, and the match wins where they overlap", () => {
    expect(plain(excerpt("foo(bar, baz)", [4, 7], [[5, 9], [9, 12]]))).toEqual([
      ["foo(", "plain"],
      ["bar", "match"],
      [", baz", "narrow"],
      [")", "plain"],
    ])
  })
})
