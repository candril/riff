import { expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "../../utils/file-tree"
import { treeRowsOf } from "../../components"
import { collectMultiSelectionFiles, getTreeMultiSelectionFilenames } from "./multi-selection"

const fileDiff = (name: string) => `diff --git a/${name} b/${name}
index 1111111..2222222 100644
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-export const old = 1
+export const now = 1
`

const files = parseDiff(["lib/c.ts", "src/a.ts", "src/b.ts", "z.ts"].map(fileDiff).join(""))
const initial = createInitialState(files, buildFileTree(files), "test", "")

/** The range from one drawn row to another, by path. */
function select(state: AppState, from: string, to: string): AppState {
  const rows = treeRowsOf(state)
  const index = (path: string) => rows.findIndex((row) => row.node.path === path)
  expect([index(from), index(to)]).not.toContain(-1)
  return { ...state, treeSelectionAnchor: from, treeHighlightIndex: index(to) }
}

const names = (state: AppState) => collectMultiSelectionFiles(state, treeRowsOf(state)).map((f) => f.filename)

test("the directories in the range are skipped, and its files kept", () => {
  expect(names(select(initial, "lib", "src/a.ts"))).toEqual(["lib/c.ts", "src/a.ts"])
  expect(names(select(initial, "src/b.ts", "lib"))).toEqual(["lib/c.ts", "src/a.ts", "src/b.ts"])
})

test("only drawn rows count: a file under a collapsed directory is not in the range", () => {
  const collapsed = { ...initial, fileTree: toggleNodeExpansion(initial.fileTree, "src") }
  expect(names(select(collapsed, "lib/c.ts", "z.ts"))).toEqual(["lib/c.ts", "z.ts"])
})

test("no anchor selects nothing", () => {
  expect(names(initial)).toEqual([])
  expect(getTreeMultiSelectionFilenames(initial)).toEqual(new Set())
  expect(getTreeMultiSelectionFilenames(select(initial, "src/a.ts", "src/b.ts"))).toEqual(new Set(["src/a.ts", "src/b.ts"]))
})
