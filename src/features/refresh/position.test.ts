import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { createCursorState } from "../../vim-diff/cursor-state"
import { createSearchState } from "../../vim-diff/search-state"
import { createInitialState } from "../../state"
import { buildFileTree } from "../../utils/file-tree"
import type { DiffFile } from "../../utils/diff-parser"
import type { VimCursorState } from "../../vim-diff/types"
import {
  capturePosition,
  captureAnchor,
  refreshMessage,
  relocate,
  restorePosition,
  restoreSearch,
  wasForcePushed,
} from "./position"

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
  diffFile("a.ts", "@@ -1,3 +1,3 @@\n const one = 1\n const two = 2\n+const three = 3"),
  diffFile("b.ts", "@@ -1,2 +1,2 @@\n const four = 4\n+const five = 5"),
]

function mappingOf(of: DiffFile[], collapsed = new Set<string>()): DiffLineMapping {
  return new DiffLineMapping(of, "all", undefined, { collapsedFiles: collapsed })
}

function cursorAt(line: number, col = 0): VimCursorState {
  return { ...createCursorState(), line, col }
}

function lineOf(mapping: DiffLineMapping, filename: string, lineNum: number): number {
  const index = mapping.allLines.findIndex(
    (line) => line.filename === filename && line.newLineNum === lineNum
  )
  if (index === -1) throw new Error(`${filename}:${lineNum} is not in the mapping`)
  return index
}

describe("anchoring the cursor", () => {
  test("finds the same line of the same file after a rebuild", () => {
    const mapping = mappingOf(files)
    const anchor = captureAnchor(mapping, cursorAt(lineOf(mapping, "b.ts", 2), 4))
    expect(anchor).toMatchObject({ filename: "b.ts", lineNum: 2, side: "RIGHT", col: 4 })

    // A file growing above it renumbers every row below.
    const grown = [
      diffFile("a.ts", "@@ -1,5 +1,5 @@\n const one = 1\n+const inserted = 0\n const two = 2\n+const three = 3"),
      files[1]!,
    ]
    const rebuilt = mappingOf(grown)
    expect(relocate(rebuilt, anchor)).toEqual({
      line: lineOf(rebuilt, "b.ts", 2),
      landing: "exact",
    })
  })

  test("a row without a line number borrows the numbered row above it", () => {
    const mapping = mappingOf(files)
    const header = mapping.allLines.findIndex((line) => line.type === "file-header" && line.filename === "b.ts")
    expect(captureAnchor(mapping, cursorAt(header))).toMatchObject({
      filename: "b.ts",
      lineNum: undefined,
    })
  })

  test("lands nearby when the line itself is gone", () => {
    const mapping = mappingOf(files)
    const anchor = captureAnchor(mapping, cursorAt(lineOf(mapping, "a.ts", 3)))

    const shrunk = [diffFile("a.ts", "@@ -1,1 +1,1 @@\n const one = 1"), files[1]!]
    const rebuilt = mappingOf(shrunk)
    const landed = relocate(rebuilt, anchor)

    expect(landed.landing).toBe("nearby")
    expect(rebuilt.getLine(landed.line)?.filename).toBe("a.ts")
  })

  test("lands on the file when it is collapsed to its header", () => {
    const mapping = mappingOf(files)
    const anchor = captureAnchor(mapping, cursorAt(lineOf(mapping, "a.ts", 2)))

    const rebuilt = mappingOf(files, new Set(["a.ts"]))
    const landed = relocate(rebuilt, anchor)

    expect(landed.landing).toBe("file")
    expect(rebuilt.getLine(landed.line)?.type).toBe("file-header")
  })

  test("lands at the top when the file is gone", () => {
    const mapping = mappingOf(files)
    const anchor = captureAnchor(mapping, cursorAt(lineOf(mapping, "a.ts", 2)))

    expect(relocate(mappingOf([files[1]!]), anchor)).toEqual({ line: 0, landing: "top" })
  })
})

describe("restoring the view", () => {
  function stateWith(of: DiffFile[]) {
    return createInitialState(of, buildFileTree(of), "local", "local changes")
  }

  test("keeps the selected file, the folds and the view mode", () => {
    const before = {
      ...stateWith(files),
      viewMode: "diff" as const,
      selectedFileIndex: 1,
      collapsedFiles: new Set(["a.ts"]),
      collapsedHunks: new Set(["b.ts:0"]),
      expandedDividers: new Set(["b.ts:1"]),
      wrapLines: true,
      treeFilter: "b",
      focusedPanel: "tree" as const,
    }
    const position = capturePosition(before, cursorAt(0), mappingOf(files), createSearchState())

    // The reload reorders the files: an index would now point elsewhere.
    const reordered = [files[1]!, files[0]!]
    const after = restorePosition(stateWith(reordered), position)

    expect(after.files[after.selectedFileIndex!]?.filename).toBe("b.ts")
    expect(after.collapsedFiles).toEqual(new Set(["a.ts"]))
    expect(after.collapsedHunks).toEqual(new Set(["b.ts:0"]))
    expect(after.expandedDividers).toEqual(new Set(["b.ts:1"]))
    expect(after.wrapLines).toBe(true)
    expect(after.treeFilter).toBe("b")
    expect(after.focusedPanel).toBe("tree")
    expect(after.viewMode).toBe("diff")
  })

  test("a PR that was being read as a diff does not snap back to the overview", () => {
    const before = { ...stateWith(files), appMode: "pr" as const, viewMode: "diff" as const }
    const position = capturePosition(before, cursorAt(0), mappingOf(files), createSearchState())

    const reloaded = { ...stateWith(files), appMode: "pr" as const, viewMode: "pr" as const }
    expect(restorePosition(reloaded, position).viewMode).toBe("diff")
  })

  test("a selected file that the reload dropped falls back to the whole diff", () => {
    const before = { ...stateWith(files), selectedFileIndex: 0 }
    const position = capturePosition(before, cursorAt(0), mappingOf(files), createSearchState())

    expect(restorePosition(stateWith([files[1]!]), position).selectedFileIndex).toBeNull()
  })

  test("the search pattern survives, its matches do not", () => {
    const search = {
      ...createSearchState(),
      pattern: "const",
      regex: /const/g,
      lastPattern: "const",
      matches: [{ line: 3, startCol: 0, endCol: 5 }],
      currentMatchIndex: 0,
    }

    const restored = restoreSearch(search)
    expect(restored.pattern).toBe("const")
    expect(restored.lastPattern).toBe("const")
    expect(restored.matches).toEqual([])
    expect(restored.currentMatchIndex).toBe(-1)
  })
})

describe("what the refresh says", () => {
  const anchor = { filename: "a.ts", side: "RIGHT" as const, lineNum: 12, col: 0 }

  test("says nothing beyond the refresh when the cursor landed where it was", () => {
    expect(refreshMessage("exact", anchor, false)).toEqual({ message: "Refreshed", type: "success" })
  })

  test("names the move", () => {
    expect(refreshMessage("nearby", anchor, false).message).toBe(
      "Line 12 of a.ts is gone — landed nearby"
    )
  })

  test("names a rewrite of the branch alongside it", () => {
    expect(refreshMessage("nearby", anchor, true).message).toBe(
      "The branch was force-pushed; line 12 of a.ts is gone — landed nearby"
    )
  })

  test("names a rewrite that moved nothing", () => {
    expect(refreshMessage("exact", anchor, true).message).toBe("The branch was force-pushed")
  })
})

describe("detecting a force-push", () => {
  const commits = [{ sha: "abc1234" }, { sha: "def5678" }]

  test("the head is still in the PR", () => {
    expect(wasForcePushed("def5678901234", commits, 100)).toBe(false)
  })

  test("the head is not in the PR anymore", () => {
    expect(wasForcePushed("999aaaa0000", commits, 100)).toBe(true)
  })

  test("says nothing when the commit list is truncated", () => {
    expect(wasForcePushed("999aaaa0000", commits, 2)).toBe(false)
  })

  test("says nothing on the first load, before there is a head to compare", () => {
    expect(wasForcePushed(undefined, commits, 100)).toBe(false)
  })
})
