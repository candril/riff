import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { treeRowsOf } from "../components/FileTree"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { keepDiffFileHighlighted, keepDiffFileInTree } from "./tree-unviewed"

const diffOf = (name: string) => `diff --git a/${name} b/${name}
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-a
+b
`
const FILES = sortFiles(parseDiff(["a.ts", "b.ts", "c.ts", "d.ts"].map(diffOf).join("")))

function stateWith(viewed: string[], patch: Partial<AppState> = {}): AppState {
  const fileStatuses = new Map<string, FileReviewStatus>(viewed.map((filename) => [filename, { filename, viewed: true }]))
  return {
    ...createInitialState(FILES, buildFileTree(FILES), "local", "local changes"),
    fileStatuses,
    treeUnviewedOnly: true,
    focusedPanel: "diff",
    ...patch,
  }
}

const paths = (state: AppState) => treeRowsOf(state).map((item) => item.node.path)
const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path
const indexOf = (filename: string) => FILES.findIndex((file) => file.filename === filename)

describe("keepDiffFileInTree", () => {
  test("keeps the viewed file under the diff's cursor in the tree", () => {
    const kept = keepDiffFileInTree(stateWith(["b.ts", "c.ts"]), "b.ts")
    expect(kept.treeKeptFile).toBe("b.ts")
    expect(paths(kept)).toEqual(["a.ts", "b.ts", "d.ts"])
  })

  test("leaves the tree alone while it has focus", () => {
    const state = stateWith(["b.ts"], { focusedPanel: "tree" })
    expect(keepDiffFileInTree(state, "b.ts")).toBe(state)
  })

  test("keeps a selected viewed file and highlights its row", () => {
    const kept = keepDiffFileInTree(stateWith(["a.ts", "c.ts"], { selectedFileIndex: indexOf("c.ts") }), null)
    expect(kept.treeKeptFile).toBe("c.ts")
    expect(paths(kept)).toEqual(["b.ts", "c.ts", "d.ts"])
    expect(highlighted(kept)).toBe("c.ts")
  })
})

describe("keepDiffFileHighlighted", () => {
  test("says the highlight moved when a selected file's row took it", () => {
    const { state, moved } = keepDiffFileHighlighted(stateWith(["c.ts"], { selectedFileIndex: indexOf("c.ts") }), null)
    expect(highlighted(state)).toBe("c.ts")
    expect(moved).toBe(true)
  })

  test("says nothing moved when the highlight was already there", () => {
    const { moved } = keepDiffFileHighlighted(stateWith([], { selectedFileIndex: 0 }), null)
    expect(moved).toBe(false)
  })
})
