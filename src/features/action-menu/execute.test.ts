import { describe, expect, test } from "bun:test"
import { executeAction, type ActionHandlers } from "./execute"
import { getAvailableActions } from "../../actions/registry"
import { createInitialState, toggleThreadPanelOpenOnly, toggleTreeUnviewedOnly, type AppState } from "../../state"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import type { Comment } from "../../types"
import { createFilePickerState } from "../file-picker/state"
import { createCommentsPickerState } from "../comments-picker/state"
import { createOccurrencePickerState } from "../occurrence-picker/state"
import { createMarksPickerState } from "../marks/picker-state"
import { createCommitPickerState } from "../commit-picker/state"

const COMMENT: Comment = {
  id: "c1",
  filename: "src/a.ts",
  line: 1,
  side: "RIGHT",
  body: "a thread",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
}

describe("Show Only Open Threads", () => {
  test("is offered once there are threads to hide", () => {
    const base = createInitialState([], [], "local", "local changes")
    const ids = (state: AppState) => getAvailableActions(state).map((action) => action.id)
    expect(ids(base)).not.toContain("toggle-open-threads-only")
    expect(ids({ ...base, comments: [COMMENT] })).toContain("toggle-open-threads-only")
  })

  test("goes through the same toggle as H, and flips the flag each time", async () => {
    let state: AppState = { ...createInitialState([], [], "local", "local changes"), comments: [COMMENT] }
    let saves = 0
    const handlers = {
      handleToggleOpenThreadsOnly: () => {
        state = toggleThreadPanelOpenOnly(state)
        saves++
      },
    } as unknown as ActionHandlers
    const run = () =>
      executeAction("toggle-open-threads-only", {
        state,
        setState: (update) => (state = update(state)),
        render: () => {},
        filePicker: createFilePickerState(),
        commentsPicker: createCommentsPickerState(),
        occurrencePicker: createOccurrencePickerState(),
        marksPicker: createMarksPickerState(),
        commitPicker: createCommitPickerState(),
        handlers,
        commandKeys: new Map(),
        runCommand: () => false,
      })

    await run()
    expect(state.threadPanelOpenOnly).toBe(true)
    await run()
    expect(state.threadPanelOpenOnly).toBe(false)
    expect(saves).toBe(2)
  })
})

describe("Show Only Unviewed Files", () => {
  const files = parseDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1,1 +1,1 @@
-a
+b
`)

  test("is offered once there are files to hide", () => {
    const ids = (state: AppState) => getAvailableActions(state).map((action) => action.id)
    expect(ids(createInitialState([], [], "local", "local changes"))).not.toContain("toggle-unviewed-files-only")
    expect(ids(createInitialState(files, buildFileTree(files), "local", "local changes"))).toContain("toggle-unviewed-files-only")
  })

  test("goes through the same toggle as H, and flips the flag each time", async () => {
    let state: AppState = createInitialState(files, buildFileTree(files), "local", "local changes")
    let saves = 0
    const handlers = {
      handleToggleUnviewedFilesOnly: () => {
        state = toggleTreeUnviewedOnly(state, null)
        saves++
      },
    } as unknown as ActionHandlers
    const run = () =>
      executeAction("toggle-unviewed-files-only", {
        state,
        setState: (update) => (state = update(state)),
        render: () => {},
        filePicker: createFilePickerState(),
        commentsPicker: createCommentsPickerState(),
        occurrencePicker: createOccurrencePickerState(),
        marksPicker: createMarksPickerState(),
        commitPicker: createCommitPickerState(),
        handlers,
        commandKeys: new Map(),
        runCommand: () => false,
      })

    await run()
    expect(state.treeUnviewedOnly).toBe(true)
    await run()
    expect(state.treeUnviewedOnly).toBe(false)
    expect(saves).toBe(2)
  })
})
