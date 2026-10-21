import { describe, expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import { createInitialState, type AppState } from "../../state"
import { treeRowsOf } from "../../components/FileTree"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import type { FileReviewStatus } from "../../types"
import { handleInput } from "./input"

const diffOf = (name: string) => `diff --git a/${name} b/${name}
--- a/${name}
+++ b/${name}
@@ -1,1 +1,1 @@
-a
+b
`
const FILES = sortFiles(parseDiff(["a.ts", "b.ts", "c.ts"].map(diffOf).join("")))

function pickerOn(filename: string, patch: Partial<AppState>): AppState {
  const base = createInitialState(FILES, buildFileTree(FILES), "local", "local changes")
  const selectedIndex = FILES.findIndex((file) => file.filename === filename)
  return { ...base, focusedPanel: "tree", ...patch, filePicker: { ...base.filePicker, open: true, selectedIndex } }
}

function pressEnter(state: AppState): AppState {
  let current = state
  const key = { name: "return", preventDefault() {} } as unknown as KeyEvent
  handleInput(key, {
    get state() {
      return current
    },
    setState: (updater) => (current = updater(current)),
    render: () => {},
    onFileSelected: () => {},
    revealFile: () => {},
  })
  return current
}

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path
const viewed = (...names: string[]) =>
  new Map<string, FileReviewStatus>(names.map((filename) => [filename, { filename, viewed: true }]))

describe("picking a file", () => {
  test("highlights its row among the rows left once viewed files are hidden", () => {
    const after = pressEnter(pickerOn("c.ts", { treeUnviewedOnly: true, fileStatuses: viewed("a.ts") }))
    expect(highlighted(after)).toBe("c.ts")
  })

  test("a viewed file is kept in the tree and highlighted", () => {
    const after = pressEnter(
      pickerOn("a.ts", { treeUnviewedOnly: true, fileStatuses: viewed("a.ts"), treeHighlightIndex: 1 })
    )
    expect(after.treeKeptFile).toBe("a.ts")
    expect(highlighted(after)).toBe("a.ts")
  })

  test("highlights its row among the rows a path filter leaves", () => {
    const after = pressEnter(pickerOn("c.ts", { treeFilter: "c" }))
    expect(highlighted(after)).toBe("c.ts")
  })
})
