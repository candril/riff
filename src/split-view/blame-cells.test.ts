import { describe, expect, test } from "bun:test"
import { BLAME_CELLS } from "../components/blame-column-model"
import type { Row } from "../diff-rows/rows"
import type { BlameColumnState } from "../features/blame/column-state"
import type { BlameLine } from "../providers/blame/types"
import type { DiffLine } from "../vim-diff/types"
import { blameWidthIn, splitBlameCells, unifiedBlameCells, type BlameColumns } from "./blame-cells"

const line = (type: DiffLine["type"], extra: Partial<DiffLine> = {}): DiffLine => ({
  visualIndex: 0,
  type,
  content: "",
  rawLine: "",
  filename: "a.ts",
  ...extra,
})
const commit = (sha: string, author: string): BlameLine => ({
  kind: "commit",
  commit: { sha: `${sha}${"0".repeat(32)}`, shortSha: sha, author, date: "2026-01-01T00:00:00Z", subject: "s" },
})
const A = commit("aaaaaaaa", "Ada")
const B = commit("bbbbbbbb", "Grace")

const ready = (base: (BlameLine | undefined)[], head: (BlameLine | undefined)[]): BlameColumnState => ({
  status: "ready",
  base: [undefined, ...base],
  head: [undefined, ...head],
})
const columnsOf = (entries: Record<string, BlameColumnState>): BlameColumns => new Map(Object.entries(entries))
const named = (cells: ReadonlyMap<number, string>) => [...cells].map(([index, cell]) => [index, cell.trimEnd()])

const lineRow = (index: number): Row => ({ kind: "line", key: `l${index}`, index })
const pairRow = (left?: number, right?: number): Row => ({ kind: "pair", key: `p${left}-${right}`, left, right })

describe("splitBlameCells", () => {
  // A context line, a removal with nothing opposite it, then two context lines across a divider.
  const lines = [
    line("context", { oldLineNum: 1, newLineNum: 1 }),
    line("deletion", { oldLineNum: 2 }),
    line("context", { oldLineNum: 3, newLineNum: 2 }),
    line("divider"),
    line("context", { oldLineNum: 40, newLineNum: 39 }),
  ]
  const rows = [pairRow(0, 0), pairRow(1, undefined), pairRow(2, 2), lineRow(3), pairRow(4, 4)]
  const head: (BlameLine | undefined)[] = [A, A]
  head[38] = A
  const base: (BlameLine | undefined)[] = [A, B, A]
  base[39] = A
  const columns = columnsOf({ "a.ts": ready(base, head) })

  test("a half left empty opposite the other pane's line does not end a run; a row across both panes does", () => {
    expect(named(splitBlameCells(rows, lines, columns, "right"))).toEqual([
      [0, "aaaaaaaa Ada"],
      [2, ""],
      [3, ""],
      [4, "aaaaaaaa Ada"],
    ])
  })

  test("the pane with the line in its half blames it on its own side", () => {
    expect(named(splitBlameCells(rows, lines, columns, "left"))).toEqual([
      [0, "aaaaaaaa Ada"],
      [1, "bbbbbbbb Grace"],
      [2, "aaaaaaaa Ada"],
      [3, ""],
      [4, "aaaaaaaa Ada"],
    ])
  })

  test("while a column loads, each pane shows its loading cell once per file", () => {
    const loading = columnsOf({ "a.ts": { status: "loading" } })
    for (const pane of ["left", "right"] as const) {
      const cells = [...splitBlameCells(rows, lines, loading, pane).values()].map((cell) => cell.trim())
      expect(cells.filter((cell) => cell === "…")).toHaveLength(1)
      expect(cells.every((cell) => cell === "…" || cell === "")).toBe(true)
    }
  })
})

describe("unifiedBlameCells", () => {
  test("only lines whose file has a column on get a cell", () => {
    const lines = [
      line("context", { newLineNum: 1, oldLineNum: 1 }),
      line("context", { newLineNum: 1, oldLineNum: 1, filename: "b.ts" }),
    ]
    const cells = unifiedBlameCells(lines, columnsOf({ "a.ts": ready([A], [A]) }))
    expect(named(cells)).toEqual([[0, "aaaaaaaa Ada"]])
  })

  test("with no columns there are no cells", () => {
    expect(unifiedBlameCells([line("context", { newLineNum: 1 })], new Map()).size).toBe(0)
  })
})

describe("blameWidthIn", () => {
  const columns = columnsOf({ "a.ts": { status: "loading" } })

  test("a file with a column on is BLAME_CELLS wide; any other line, or none, takes no cells", () => {
    expect(blameWidthIn(columns, line("context"))).toBe(BLAME_CELLS)
    expect(blameWidthIn(columns, line("context", { filename: "b.ts" }))).toBe(0)
    expect(blameWidthIn(columns, undefined)).toBe(0)
  })
})
