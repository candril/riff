import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../state"
import { treeRowsOf } from "../components/FileTree"
import { parseDiff, sortFiles } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import type { FileReviewStatus } from "../types"
import { followCursorInTree, shownHighlightOf, syncTreeHighlight } from "./tree-highlight"

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

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path
const indexOf = (filename: string) => FILES.findIndex((file) => file.filename === filename)

describe("syncTreeHighlight", () => {
  test("says the highlight moved when a selected file's row took it", () => {
    const before = stateWith(["c.ts"], { selectedFileIndex: indexOf("c.ts") })
    const { state, reveal } = syncTreeHighlight(before, null, shownHighlightOf(before))
    expect(highlighted(state)).toBe("c.ts")
    expect(reveal).toBe(true)
  })

  test("says nothing moved when the highlight was already there", () => {
    const before = stateWith([], { selectedFileIndex: 0 })
    const { reveal } = syncTreeHighlight(before, null, shownHighlightOf(before))
    expect(reveal).toBe(false)
  })

  test("reveals a highlight set directly since the last push", () => {
    const shown = shownHighlightOf(stateWith([], { selectedFileIndex: 0, treeHighlightIndex: 0 }))
    const picked = stateWith([], { selectedFileIndex: indexOf("d.ts"), treeHighlightIndex: 3 })
    const { reveal, shown: now } = syncTreeHighlight(picked, null, shown)
    expect(reveal).toBe(true)
    expect(now).toEqual({ index: 3, path: "d.ts" })
  })

  test("reveals the same index once it holds another row", () => {
    const state = stateWith([], { selectedFileIndex: 1, treeHighlightIndex: 1 })
    expect(syncTreeHighlight(state, null, { index: 1, path: "a.ts" }).reveal).toBe(true)
  })

  test("the first push does not reveal", () => {
    const state = stateWith([], { selectedFileIndex: indexOf("d.ts"), treeHighlightIndex: 3 })
    expect(syncTreeHighlight(state, null, null).reveal).toBe(false)
  })

  test("follows the diff's cursor in the all-files view with the tree unfocused", () => {
    const before = stateWith([], { treeUnviewedOnly: false, treeHighlightIndex: 0 })
    const { state, reveal } = syncTreeHighlight(before, "c.ts", shownHighlightOf(before))
    expect(highlighted(state)).toBe("c.ts")
    expect(reveal).toBe(true)
  })
})

describe("followCursorInTree", () => {
  test("does nothing in a single-file view", () => {
    const state = stateWith([], { treeUnviewedOnly: false, selectedFileIndex: 0, treeHighlightIndex: 0 })
    expect(followCursorInTree(state, "c.ts")).toBe(state)
  })

  test("leaves the highlight to the tree while it has focus", () => {
    const state = stateWith([], { treeUnviewedOnly: false, focusedPanel: "tree" })
    expect(followCursorInTree(state, "c.ts")).toBe(state)
  })

  test("moves the highlight to the cursor's file in the all-files view", () => {
    const state = stateWith([], { treeUnviewedOnly: false, treeHighlightIndex: 0 })
    expect(highlighted(followCursorInTree(state, "b.ts"))).toBe("b.ts")
  })
})
