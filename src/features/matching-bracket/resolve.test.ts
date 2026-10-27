import { describe, expect, test } from "bun:test"
import type { SimpleHighlight } from "@opentui/core"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { RowLineSource } from "../../diff-rows/row-source"
import type { FileParse } from "../../vim-diff/file-parses"
import { parseDiff } from "../../utils/diff-parser"
import { createMatchingBracketResolver, SHOWN_LINES_NOTE, type BracketTarget } from "./resolve"

const NEW = ["function f() {", "  a()", "  b()", '  c("}")', "}", "g({", "  x: 1,", "})", "end"].join("\n")
const OLD = ["function f() {", "  old()", "  b()", '  c("}")', "}", "g({", "  x: f(", "  ),", "})", "end"].join("\n")

const DIFF = [
  "diff --git a/a.ts b/a.ts",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1,2 +1,2 @@",
  " function f() {",
  "-  old()",
  "+  a()",
  "@@ -6,4 +6,3 @@",
  " g({",
  "-  x: f(",
  "-  ),",
  "+  x: 1,",
  " })",
  "",
].join("\n")

const stringAt = (text: string, part: string): SimpleHighlight => {
  const start = text.indexOf(part)
  return [start, start + part.length, "string"]
}

interface Setup {
  split?: "left" | "right"
  loaded?: boolean
  parsed?: boolean
  diff?: string
  files?: Record<string, { new: string; old: string | null }>
  collapsedBlocks?: (mapping: DiffLineMapping) => string[]
}

function setup({ split, loaded = true, parsed = true, diff = DIFF, files = { "a.ts": { new: NEW, old: OLD } }, collapsedBlocks }: Setup = {}) {
  const expanded = new Set<string>()
  const contents = new Map(Object.entries(files).map(([name, text]) => [name, text.new]))
  const build = (blocks: string[] = []) =>
    new DiffLineMapping(parseDiff(diff), "all", undefined, {
      expandedDividers: expanded,
      fileContents: loaded ? contents : new Map(),
      collapsedBlocks: new Set(blocks),
    })
  const blocks = collapsedBlocks?.(build()) ?? []
  let mapping = build(blocks)
  // Rebuilt with the mapping, as app.ts's split source is.
  let source: { mapping: DiffLineMapping; rows: RowLineSource } | null = null
  const getSource = () => {
    if (!split) return mapping
    if (source?.mapping !== mapping) source = { mapping, rows: new RowLineSource(mapping, "split", split) }
    return source.rows
  }
  const calls: string[] = []
  const resolve = createMatchingBracketResolver({
    getSource,
    getMapping: () => mapping,
    parse: (filename): FileParse | undefined => {
      const text = files[filename]
      if (!loaded || !parsed || !text) return undefined
      return {
        new: { content: text.new, highlights: filename === "a.ts" ? [stringAt(text.new, '"}"')] : null },
        old: text.old === null ? undefined : { content: text.old, highlights: filename === "a.ts" ? [stringAt(text.old, '"}"')] : null },
      }
    },
    fileText: (filename, side) => (loaded ? ((side === "old" ? files[filename]?.old : files[filename]?.new) ?? null) : null),
    expandDivider: (key) => {
      calls.push(`expand ${key}`)
      expanded.add(key)
      mapping = build(blocks)
    },
    loadFileContent: (filename) => void calls.push(`load ${filename}`),
    toast: (message) => void calls.push(`toast ${message}`),
  })

  /** The row reading `content` (the `nth` one), in the source's rows. */
  const rowOf = (content: string, nth = 0) => {
    const s = getSource()
    const rows: number[] = []
    for (let row = 0; row < s.lineCount; row++) if (s.getLineContent(row) === content) rows.push(row)
    return rows[nth]!
  }
  const at = (target: BracketTarget | null) => target && { content: getSource().getLineContent(target.row), col: target.col }
  return { resolve, rowOf, at, calls, mapping: () => mapping }
}

describe("the matching bracket's row", () => {
  test("a match on a row the diff shows", () => {
    const s = setup()
    expect(s.at(s.resolve(s.rowOf("g({"), 0))).toEqual({ content: "})", col: 1 })
    expect(s.at(s.resolve(s.rowOf("})"), 0))).toEqual({ content: "g({", col: 2 })
    expect(s.calls).toEqual([])
  })

  test("a match in collapsed context opens it and lands on the line, past the string's bracket", () => {
    const s = setup()
    const target = s.resolve(s.rowOf("function f() {"), 13)
    expect(s.calls).toEqual(["expand a.ts:middle:0"])
    expect(s.at(target)).toEqual({ content: "}", col: 0 })
    expect(s.mapping().getLine(target!.row)?.newLineNum).toBe(5)
  })

  test("without a parse yet, the file's text is matched with nothing skipped", () => {
    const s = setup({ parsed: false })
    const target = s.resolve(s.rowOf("function f() {"), 13)
    expect(s.at(target)).toEqual({ content: '  c("}")', col: 5 })
  })

  test("a removed line matches in the old text", () => {
    const s = setup()
    expect(s.at(s.resolve(s.rowOf("  x: f("), 0))).toEqual({ content: "  ),", col: 2 })
    expect(s.at(s.resolve(s.rowOf("  ),"), 0))).toEqual({ content: "  x: f(", col: 6 })
  })

  test("no bracket at or after the cursor, or no line number, does nothing", () => {
    const s = setup()
    expect(s.resolve(s.rowOf("  x: 1,"), 0)).toBeNull()
    expect(s.resolve(s.rowOf("})"), 2)).toBeNull()
    expect(s.resolve(0, 0)).toBeNull()
  })

  test("split: the left pane reads the old text", () => {
    const s = setup({ split: "left" })
    expect(s.at(s.resolve(s.rowOf("  x: f("), 0))).toEqual({ content: "  ),", col: 2 })
    expect(s.at(s.resolve(s.rowOf("g({"), 0))).toEqual({ content: "})", col: 1 })
  })

  test("split: the right pane reads the new text, and a blank half does nothing", () => {
    const s = setup({ split: "right" })
    expect(s.at(s.resolve(s.rowOf("g({"), 0))).toEqual({ content: "})", col: 1 })
    // The row whose right half is blank reads the removed `),` on the left.
    expect(s.resolve(s.rowOf("  ),"), 0)).toBeNull()
    const target = s.resolve(s.rowOf("function f() {"), 13)
    expect(s.at(target)).toEqual({ content: "}", col: 0 })
  })

  test("a file not read yet matches within its shown lines, says so, and asks for the file", () => {
    const s = setup({ loaded: false })
    expect(s.at(s.resolve(s.rowOf("g({"), 1))).toEqual({ content: "})", col: 1 })
    expect(s.calls).toEqual(["load a.ts", `toast ${SHOWN_LINES_NOTE}`])
  })

  test("a match inside a folded block lands on the fold's row", () => {
    const readme = ["Call it (like", "```js", "x)", "```", "so."].join("\n")
    const diff = [
      "diff --git a/README.md b/README.md",
      "--- /dev/null",
      "+++ b/README.md",
      "@@ -0,0 +1,5 @@",
      ...readme.split("\n").map((line) => `+${line}`),
      "",
    ].join("\n")
    const s = setup({
      diff,
      files: { "README.md": { new: readme, old: null } },
      collapsedBlocks: (mapping) => mapping.blockIdsIn("README.md"),
    })
    const target = s.resolve(s.rowOf("Call it (like"), 0)
    expect(s.mapping().getLine(target!.row)?.blockFoldId).toBeDefined()
    expect(target!.col).toBe(0)
    expect(s.calls).toEqual([])
  })
})
