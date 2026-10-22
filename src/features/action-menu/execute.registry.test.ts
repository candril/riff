import { afterAll, beforeAll, expect, test } from "bun:test"
import { executeAction, type ActionHandlers, type ExecuteContext } from "./execute"
import { actions } from "../../actions/registry"
import { actionKeys } from "../../actions/types"
import { createInitialState, type AppState } from "../../state"
import { parseDiff } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { mountApp } from "../../testing/app-render"
import { keysOn } from "../../testing/chat-keys"
import { spelledStrokes } from "../../app/spelled-keys"
import { createFilePickerState } from "../file-picker/state"
import { createToastState } from "../toast/state"
import { createCommentsPickerState } from "../comments-picker/state"
import { createOccurrencePickerState } from "../occurrence-picker/state"
import { createMarksPickerState } from "../marks/picker-state"
import { createCommitPickerState } from "../commit-picker/state"
import { createActionMenuState } from "./state"
import { createLinePeekState } from "../line-peek/state"
import { createFeedState } from "../feed/state"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,3 +1,3 @@
 export function greet() {
-  return "hi"
+  return "hello"
 }
`

let commandKeys: ReadonlyMap<string, string> = new Map()
let app: Awaited<ReturnType<typeof mountApp>> | null = null
beforeAll(async () => {
  // The hints riff's real layers register, which the fallback runs each command on.
  app = await mountApp(DIFF, { width: 100, height: 30 })
  commandKeys = keysOn(app).commandKeys
})
afterAll(async () => {
  await app?.dispose()
})

/**
 * A context whose handlers and keymap only record what reaches them, so no
 * action spawns, copies or reaches GitHub. `run` stands in for the command
 * the keymap would run.
 */
function recordingContext(run: (name: string, keys: string) => boolean = () => true) {
  const files = parseDiff(DIFF)
  let state: AppState = createInitialState(files, buildFileTree(files), "local", "local changes")
  const handled: string[] = []
  const commands: [string, string][] = []
  const handlers = new Proxy({} as ActionHandlers, {
    get: (_target, name) => () => {
      handled.push(String(name))
      return name === "handleExpandDivider" ? Promise.resolve(true) : undefined
    },
  })
  const ctx: ExecuteContext = {
    get state() {
      return state
    },
    setState: (update) => {
      state = update(state)
    },
    render: () => {},
    toast: createToastState(),
    filePicker: createFilePickerState(),
    commentsPicker: createCommentsPickerState(),
    occurrencePicker: createOccurrencePickerState(),
    marksPicker: createMarksPickerState(),
    commitPicker: createCommitPickerState(),
    actionMenu: createActionMenuState(),
    linePeek: createLinePeekState(),
    feed: createFeedState(),
    handlers,
    commandKeys,
    runCommand: (name, keys) => {
      commands.push([name, keys])
      return run(name, keys)
    },
  }
  return { ctx, handled, commands, state: () => state }
}

test("every action the palette offers is handled, by a case of its own or by the command its key runs", async () => {
  const unhandled: string[] = []
  const throughCommand: string[] = []
  const unspelled: string[] = []
  for (const action of actions) {
    const { ctx, commands } = recordingContext()
    if (!(await executeAction(action.id, ctx))) unhandled.push(action.id)
    if (commands.length === 0) continue
    throughCommand.push(action.id)
    expect({ id: action.id, commands }).toEqual({
      id: action.id,
      commands: [[action.command!, actionKeys(action, commandKeys)!]],
    })
    // The stub takes any key, but the real runner presses the strokes the
    // hint spells, and a hint that does not parse leaves it none to press.
    if (spelledStrokes(actionKeys(action, commandKeys)!) === null) unspelled.push(action.id)
  }
  expect(unhandled).toEqual([])
  expect(unspelled).toEqual([])
  expect(throughCommand).toEqual(
    expect.arrayContaining(["next-file", "jump-back", "toggle-fold", "search-diff", "visual-select", "focus-tree", "follow-link"]),
  )
})

test("an action without a case runs its command on the key the palette shows for it", async () => {
  const run = async (id: string) => {
    const { ctx, commands } = recordingContext()
    await executeAction(id, ctx)
    return commands
  }
  expect(await run("next-file")).toEqual([["bracket.nextFile", "]f"]])
  expect(await run("jump-back")).toEqual([["global.back", "Ctrl+o"]])
  expect(await run("expand-all-folds")).toEqual([["zchord.expandAllFolds", "zR"]])
  expect(await run("search-diff")).toEqual([["diff.key", "/"]])
  expect(await run("visual-select")).toEqual([["diff.key", "V"]])
  expect(await run("focus-tree")).toEqual([["global.backspace", "Ctrl+h"]])
})

test("a diff key run from the palette lands in the diff, which is where the entry says it acts", async () => {
  const { ctx, state } = recordingContext()
  ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
  await executeAction("search-diff", ctx)
  expect(state().focusedPanel).toBe("diff")
})

test("an id nothing handles reports that it ran nothing, and so does a command that declines its key", async () => {
  expect(await executeAction("no-such-action", recordingContext().ctx)).toBe(false)
  expect(await executeAction("next-file", recordingContext(() => false).ctx)).toBe(false)
})

test("a command that runs its own action back does not loop", async () => {
  let runs = 0
  const recorded = recordingContext((name) => {
    runs++
    // As a g chord's command does with copy-pr-url, aimed at an action that has no case.
    void executeAction("next-file", recorded.ctx)
    return name === "bracket.nextFile"
  })
  expect(await executeAction("next-file", recorded.ctx)).toBe(true)
  expect(runs).toBe(1)
  expect(recorded.commands).toEqual([["bracket.nextFile", "]f"]])
})
