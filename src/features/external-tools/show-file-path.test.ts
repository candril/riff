import { expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { DiffFile } from "../../utils/diff-parser"
import { showFilePath } from "./handlers"

const file: DiffFile = {
  filename: "src/greet.ts",
  additions: 1,
  deletions: 1,
  status: "modified",
  content: `diff --git a/src/greet.ts b/src/greet.ts
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,1 +1,1 @@
-hi
+hello`,
}

function showOn(files: DiffFile[]) {
  let state: AppState = { ...createInitialState(files, [], "local", ""), focusedPanel: "diff" }
  let renders = 0
  const mapping = new DiffLineMapping(files, "all")
  showFilePath({
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    getVimState: () => ({ ...createCursorState(), line: files.length ? 1 : 0 }),
    getLineMapping: () => mapping,
    render: () => {
      renders++
    },
  })
  return { toast: state.toast, renders }
}

test("the file under the cursor has its path toasted", () => {
  const { toast, renders } = showOn([file])
  expect(toast.message).toBe("src/greet.ts")
  expect(toast.type).toBe("info")
  expect(renders).toBe(1)
})

test("with no file under the cursor nothing is toasted or drawn", () => {
  const { toast, renders } = showOn([])
  expect(toast.message).toBeNull()
  expect(renders).toBe(0)
})
