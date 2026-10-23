import { describe, expect, test } from "bun:test"
import { createInitialState, focusLeft, focusRight, openInlineCommentOverlay, type AppState } from "./state"
import type { DiffFile } from "./utils/diff-parser"

const file = (filename: string): DiffFile => ({
  filename,
  additions: 1,
  deletions: 0,
  status: "modified",
  content: `diff --git a/${filename} b/${filename}\n--- a/${filename}\n+++ b/${filename}\n@@ -1,1 +1,2 @@\n one\n+two`,
})

function localState(): AppState {
  return createInitialState([file("a.ts"), file("b.ts")], [], "local", "")
}

const at = (state: AppState, focusedPanel: AppState["focusedPanel"], fields: Partial<AppState> = {}): AppState => ({
  ...state,
  ...fields,
  focusedPanel,
})

describe("the focus walk", () => {
  const withThreads = (state: AppState) => openInlineCommentOverlay(state, "a.ts", 1, "RIGHT", "view")

  test("runs tree → diff → comments → chat and back with every column open", () => {
    let state = at(withThreads({ ...localState(), showFilePanel: true }), "tree")
    const right: string[] = []
    for (let i = 0; i < 4; i++) {
      state = focusRight(state, true)
      right.push(state.focusedPanel)
    }
    expect(right).toEqual(["diff", "comments", "chat", "chat"])
    const left: string[] = []
    for (let i = 0; i < 4; i++) {
      state = focusLeft(state)
      left.push(state.focusedPanel)
    }
    expect(left).toEqual(["comments", "diff", "tree", "tree"])
  })

  test("skips the thread panel while it is closed, both ways", () => {
    const state = at(localState(), "diff")
    expect(focusRight(state, true).focusedPanel).toBe("chat")
    expect(focusLeft(at(state, "chat")).focusedPanel).toBe("diff")
  })

  test("goes no further right than what is open", () => {
    const diff = at(localState(), "diff")
    expect(focusRight(diff, false)).toBe(diff)
    const comments = at(withThreads(localState()), "comments")
    expect(focusRight(comments, false)).toBe(comments)
  })

  test("goes no further left than the diff while the tree is hidden", () => {
    const diff = at({ ...localState(), showFilePanel: false }, "diff")
    expect(focusLeft(diff)).toBe(diff)
  })

  test("leaving the tree drops its selection", () => {
    const state = at({ ...localState(), showFilePanel: true, treeSelectionAnchor: "a.ts" }, "tree")
    expect(focusRight(state, false).treeSelectionAnchor).toBeNull()
  })
})
