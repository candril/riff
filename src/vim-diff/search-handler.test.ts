import { test, expect, describe, beforeEach } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import { SearchHandler } from "./search-handler"
import { createSearchState, type SearchState } from "./search-state"
import { createCursorState } from "./cursor-state"
import type { VimCursorState } from "./types"
import type { DiffFile } from "../utils/diff-parser"

function diffFile(filename: string, body: string): DiffFile {
  return {
    filename,
    additions: 0,
    deletions: 0,
    status: "modified",
    content: [
      `diff --git a/${filename} b/${filename}`,
      `--- a/${filename}`,
      `+++ b/${filename}`,
      body,
    ].join("\n"),
  }
}

const files = [
  diffFile("a.ts", "@@ -1,2 +1,2 @@\n const here = 1\n+const alpha = 2"),
  diffFile("b.ts", "@@ -1,2 +1,2 @@\n const there = 3\n+const alpha = 4"),
]

let collapsed: Set<string>
let mapping: DiffLineMapping
let searchState: SearchState
let cursor: VimCursorState
let handler: SearchHandler

function rebuild(): void {
  mapping = new DiffLineMapping(files, "all", undefined, { collapsedFiles: collapsed })
}

function matchedFiles(): string[] {
  return [...new Set(searchState.matches.map((m) => m.filename ?? ""))]
}

/** What the prompt field reports as the pattern grows, character by character. */
function type(pattern: string): void {
  for (let i = 1; i <= pattern.length; i++) handler.updatePattern(pattern.slice(0, i))
}

beforeEach(() => {
  collapsed = new Set<string>()
  searchState = createSearchState()
  cursor = createCursorState()
  rebuild()

  handler = new SearchHandler({
    getMapping: () => mapping,
    getSearchState: () => searchState,
    setSearchState: (next) => {
      searchState = next
    },
    getCursor: () => cursor,
    setCursor: (line, col) => {
      cursor = { ...cursor, line, col }
    },
    getFileContent: () => null,
    loadFileContent: async () => {},
    expandDividerForLine: () => {},
    getCollapsedFiles: () =>
      files
        .filter((file) => collapsed.has(file.filename))
        .map((file) => ({ filename: file.filename, diff: file.content })),
    expandFiles: (filenames) => {
      for (const filename of filenames) collapsed.delete(filename)
      rebuild()
    },
    onUpdate: () => {},
  })
})

describe("resuming the last search", () => {
  test("n picks the pattern back up after Escape cleared it", () => {
    handler.startSearch("forward")
    type("alpha")
    handler.confirmSearch()
    const firstMatch = cursor.line

    handler.clearSearch()
    expect(searchState.pattern).toBe("")
    expect(searchState.matches).toHaveLength(0)

    handler.jumpToMatch("next")
    expect(searchState.pattern).toBe("alpha")
    expect(searchState.matches.length).toBeGreaterThan(1)
    expect(cursor.line).toBeGreaterThan(firstMatch)
  })

  test("N resumes it in the other direction", () => {
    handler.startSearch("forward")
    type("alpha")
    handler.confirmSearch()
    handler.clearSearch()

    handler.jumpToMatch("prev")
    expect(searchState.pattern).toBe("alpha")
    expect(searchState.wrapped).toBe(true)
  })

  test("abandoning a prompt leaves the previous search to resume", () => {
    handler.startSearch("forward")
    type("alpha")
    handler.confirmSearch()

    handler.startSearch("forward")
    type("there")
    handler.cancelSearch()

    handler.jumpToMatch("next")
    expect(searchState.pattern).toBe("alpha")
  })

  test("n does nothing when nothing was ever searched", () => {
    handler.jumpToMatch("next")
    expect(searchState.pattern).toBe("")
    expect(cursor.line).toBe(0)
  })
})

describe("collapsed files", () => {
  test("a file marked viewed is opened by a search that hits it", () => {
    collapsed.add("b.ts")
    rebuild()

    handler.startSearch("forward")
    type("alpha")
    // Only the visible file can match while the rows are hidden.
    expect(matchedFiles()).toEqual(["a.ts"])

    handler.confirmSearch()
    expect(collapsed.has("b.ts")).toBe(false)
    expect(matchedFiles()).toEqual(["a.ts", "b.ts"])
  })

  test("a collapsed file the pattern misses stays shut", () => {
    collapsed.add("b.ts")
    rebuild()

    handler.startSearch("forward")
    type("const here")
    handler.confirmSearch()
    expect(collapsed.has("b.ts")).toBe(true)
  })

  test("a hit on the diff's own header does not open the file", () => {
    collapsed.add("b.ts")
    rebuild()

    handler.startSearch("forward")
    type("b.ts")
    handler.confirmSearch()
    expect(collapsed.has("b.ts")).toBe(true)
  })

  test("resuming with n opens what the pattern hits", () => {
    handler.startSearch("forward")
    type("alpha")
    handler.confirmSearch()
    handler.clearSearch()

    collapsed.add("b.ts")
    rebuild()

    handler.jumpToMatch("next")
    expect(collapsed.has("b.ts")).toBe(false)
    expect(matchedFiles()).toEqual(["a.ts", "b.ts"])
  })

  test("the cursor keeps its row when a file above it opens", () => {
    collapsed.add("a.ts")
    rebuild()
    // Park on b.ts's added line, which sits two rows below a.ts's header.
    const target = rowOf("b.ts", "const alpha = 4")
    cursor = { ...cursor, line: target }

    handler.startSearch("forward")
    type("alpha")
    handler.confirmSearch()

    expect(collapsed.has("a.ts")).toBe(false)
    // The row moved down as a.ts unfolded; the search still resumed from it.
    expect(rowOf("b.ts", "const alpha = 4")).toBeGreaterThan(target)
  })
})

function rowOf(filename: string, content: string): number {
  for (let i = 0; i < mapping.lineCount; i++) {
    const line = mapping.getLine(i)
    if (line?.filename === filename && line.content === content) return i
  }
  throw new Error(`no row for ${content} in ${filename}`)
}
