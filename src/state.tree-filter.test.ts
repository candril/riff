import { describe, expect, test } from "bun:test"
import { createInitialState, keepTreeFile, toggleTreeUnviewedOnly, type AppState } from "./state"
import { treeRowsOf } from "./components/FileTree"
import { parseDiff, sortFiles } from "./utils/diff-parser"
import { buildFileTree } from "./utils/file-tree"
import type { FileReviewStatus } from "./types"

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
  return { ...createInitialState(FILES, buildFileTree(FILES), "local", "local changes"), fileStatuses, ...patch }
}

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path
const paths = (state: AppState) => treeRowsOf(state).map((item) => item.node.path)

describe("toggleTreeUnviewedOnly", () => {
  test("hides viewed files, keeps the reader's file and the highlight on its row", () => {
    const before = stateWith(["a.ts", "b.ts"], { treeHighlightIndex: 2 })
    const on = toggleTreeUnviewedOnly(before, "b.ts")
    expect(paths(on)).toEqual(["b.ts", "c.ts", "d.ts"])
    expect(on.treeKeptFile).toBe("b.ts")
    expect(highlighted(on)).toBe("c.ts")

    const off = toggleTreeUnviewedOnly(on, "c.ts")
    expect(off.treeUnviewedOnly).toBe(false)
    expect(off.treeKeptFile).toBeNull()
    expect(paths(off)).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"])
    expect(highlighted(off)).toBe("c.ts")
  })

  test("clamps when the highlighted row is itself hidden", () => {
    const on = toggleTreeUnviewedOnly(stateWith(["c.ts", "d.ts"], { treeHighlightIndex: 3 }), null)
    expect(paths(on)).toEqual(["a.ts", "b.ts"])
    expect(on.treeHighlightIndex).toBe(1)
  })
})

describe("keepTreeFile", () => {
  test("the highlight keeps its path when a viewed row above it vanishes or comes back", () => {
    const on = toggleTreeUnviewedOnly(stateWith(["a.ts"], { treeHighlightIndex: 2 }), "a.ts")
    expect(paths(on)).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"])
    expect(highlighted(on)).toBe("c.ts")

    const dropped = keepTreeFile(on, "d.ts")
    expect(paths(dropped)).toEqual(["b.ts", "c.ts", "d.ts"])
    expect(highlighted(dropped)).toBe("c.ts")

    const back = keepTreeFile(dropped, "a.ts")
    expect(highlighted(back)).toBe("c.ts")
    expect(back.treeHighlightIndex).toBe(2)
  })

  test("clamps when the highlighted path is gone", () => {
    const on = toggleTreeUnviewedOnly(stateWith(["c.ts", "d.ts"], { treeHighlightIndex: 3 }), "d.ts")
    expect(highlighted(on)).toBe("d.ts")
    const gone = keepTreeFile(on, null)
    expect(paths(gone)).toEqual(["a.ts", "b.ts"])
    expect(gone.treeHighlightIndex).toBe(1)
  })

  test("an unchanged file hands the state back as it is", () => {
    const on = toggleTreeUnviewedOnly(stateWith(["a.ts"]), "a.ts")
    expect(keepTreeFile(on, "a.ts")).toBe(on)
  })
})
