import { test, expect, describe, beforeEach } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import { VimMotionHandler, type KeyEvent } from "./motion-handler"
import { createCursorState, getCharSelection, getSelectionRange } from "./cursor-state"
import type { VimCursorState } from "./types"
import type { DiffFile } from "../utils/diff-parser"

/**
 *  0 context   function run(opts) {
 *  1 deletion    const old = "gone"
 *  2 addition    const name = "kept"
 *  3 context   }
 */
const file: DiffFile = {
  filename: "app.ts",
  additions: 1,
  deletions: 1,
  status: "modified",
  content: `diff --git a/app.ts b/app.ts
--- a/app.ts
+++ b/app.ts
@@ -1,3 +1,3 @@
 function run(opts) {
-  const old = "gone"
+  const name = "kept"
 }`,
}

const mapping = new DiffLineMapping([file], "single", 0)

let state: VimCursorState
let handler: VimMotionHandler

function press(...keys: (string | KeyEvent)[]): boolean {
  let handled = false
  for (const key of keys) {
    handled = handler.handleKey(typeof key === "string" ? { name: key, sequence: key } : key)
  }
  return handled
}

beforeEach(() => {
  state = createCursorState()
  handler = new VimMotionHandler({
    getMapping: () => mapping,
    getState: () => state,
    setState: (next) => {
      state = next
    },
    getViewportHeight: () => 10,
    onCursorMove: () => {},
  })
})

describe("visual modes", () => {
  test("v enters charwise, v again leaves, V reshapes without losing the ends", () => {
    press("v")
    expect(state.mode).toBe("visual")
    expect(state.selectionAnchor).toBe(0)
    expect(state.selectionAnchorCol).toBe(0)

    press({ name: "v", shift: true })
    expect(state.mode).toBe("visual-line")
    expect(state.selectionAnchor).toBe(0)

    press({ name: "v", shift: true })
    expect(state.mode).toBe("normal")
    expect(state.selectionAnchor).toBeNull()
  })

  test("motions extend the selection", () => {
    press("v", "l", "l")
    expect(getCharSelection(state)).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 2,
    })

    press("j")
    expect(getSelectionRange(state)).toEqual([0, 1])
  })

  test("o puts the cursor on the other end", () => {
    press("v", "l", "l", "o")
    expect(state.line).toBe(0)
    expect(state.col).toBe(0)
    expect(getCharSelection(state)).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 2,
    })
  })
})

describe("text objects", () => {
  test("viw selects the word under the cursor", () => {
    // "function run(opts) {" — park on `run`.
    press("l", "l", "l", "l", "l", "l", "l", "l", "l")
    expect(state.col).toBe(9)

    press("v", "i", "w")
    expect(getCharSelection(state)).toEqual({
      startLine: 0,
      startCol: 9,
      endLine: 0,
      endCol: 11,
    })
  })

  test("vi\" reaches into the string on the added line", () => {
    press("j", "j", "v", "i", '"')
    expect(getCharSelection(state)).toEqual({
      startLine: 2,
      startCol: 16,
      endLine: 2,
      endCol: 19,
    })
  })

  test("vi+ is linewise over the run of added rows", () => {
    press("j", "j", "v", "i", "+")
    expect(state.mode).toBe("visual-line")
    expect(getSelectionRange(state)).toEqual([2, 2])
  })

  test("an object that resolves to nothing leaves the selection alone", () => {
    press("v", "l", "i", '"')
    expect(state.pendingTextObject).toBeNull()
    expect(getCharSelection(state)).toEqual({
      startLine: 0,
      startCol: 0,
      endLine: 0,
      endCol: 1,
    })
  })

  test("escape cancels a pending object", () => {
    press("v", "i")
    expect(state.pendingTextObject).toEqual({ scope: "i" })
    press("escape")
    expect(state.pendingTextObject).toBeNull()
    expect(state.mode).toBe("visual")
  })

  test("i is left alone in normal mode, where it toggles the PR overview", () => {
    expect(press("i")).toBe(false)
    expect(state.pendingTextObject).toBeNull()
  })
})
