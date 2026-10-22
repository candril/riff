import { afterEach, expect, test } from "bun:test"
import { actions } from "./registry"
import { actionKeys } from "./types"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"

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

/** The hint the palette shows for each action that names its command, as it showed it when each was a string of its own, or still is. */
const SHOWN: Record<string, string> = {
  "find-files": "Ctrl+f",
  "find-comments": "gC",
  "find-marks": "Ctrl+k",
  "find-occurrences": "Ctrl+s",
  "next-file": "]f",
  "prev-file": "[f",
  "next-hunk": "]c",
  "prev-hunk": "[c",
  "next-unviewed": "]u",
  "prev-unviewed": "[u",
  "next-outdated": "]o",
  "prev-outdated": "[o",
  "next-commit": "]g",
  "prev-commit": "[g",
  "select-commit": "Ctrl+g",
  "diff-in-editor": "gd",
  "diff-in-tmux-pane": "gD",
  "open-in-editor": "ge",
  "open-in-tmux-window": "gE",
  "follow-link": "gf",
  "open-url": "gx",
  "checkout-and-edit": "gc",
  "jump-back": "Ctrl+o",
  "jump-forward": "Ctrl+i",
  "toggle-wrap": "zw",
  "peek-line": "gl",
  "toggle-fold": "za",
  "open-fold": "zo",
  "close-fold": "zc",
  "expand-all-folds": "zR",
  "collapse-all-folds": "zM",
  "submit-review": "gS",
  "sync-changes": "gs",
  "submit-comment": "S",
  "delete-comment": "d",
  "create-pr": "gP",
  "edit-pr": "gP",
  "open-in-board": "gB",
  "pr-info": "gi",
  "copy-pr-url": "gy",
  "copy-permalink": "gY",
  "copy-comment-link": "y (comments panel)",
  react: "+",
  "toggle-file-panel": "Ctrl+b",
  "toggle-file-panel-expanded": "Ctrl+e",
  "toggle-open-threads-only": "H (comments panel)",
  refresh: "gr",
  quit: "q",
  "search-diff": "/",
  "search-diff-backward": "?",
  "search-word": "*",
  "add-comment": "c",
  "visual-select": "V",
  "visual-select-char": "v",
  "mark-viewed": "x",
  "focus-tree": "Ctrl+h",
  "focus-content": "Ctrl+l",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff's real layers, built as createAppKeys builds them. */
async function realKeys() {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  return keysOn(app)
}

/** The `keys` of every command riff's real layers register. */
async function realCommandKeys() {
  return (await realKeys()).commandKeys
}

test("every command an action names is registered, and the action has a key to show and run it on", async () => {
  const { commandKeys, keymap } = await realKeys()
  const registered = new Set(keymap.getCommands({ visibility: "registered" }).map((command) => command.name))
  const named = actions.flatMap((action) => (action.command ? [action] : []))
  expect(named.length).toBeGreaterThan(0)
  for (const { id, command, shortcut } of named) {
    expect({ id, registered: registered.has(command!) }).toEqual({ id, registered: true })
    expect({ id, keys: commandKeys.get(command!) ?? shortcut }).toEqual({ id, keys: expect.any(String) })
  }
})

test("an action carries a shortcut beside its command only where the command spells no key", async () => {
  const commandKeys = await realCommandKeys()
  const both = actions.filter((action) => action.command && action.shortcut)
  expect(both.filter((action) => commandKeys.has(action.command!)).map((action) => action.id)).toEqual([])
  // The diff's keys, which its catch-all reads whatever they are.
  expect(Object.fromEntries(both.map((action) => [action.id, `${action.command} ${action.shortcut}`]))).toEqual({
    "search-diff": "diff.key /",
    "search-diff-backward": "diff.key ?",
    "search-word": "diff.key *",
    "add-comment": "diff.key c",
    "visual-select": "diff.key V",
    "visual-select-char": "diff.key v",
    "mark-viewed": "diff.key x",
  })
})

test("each action that names its command shows the key it showed as a string of its own", async () => {
  const commandKeys = await realCommandKeys()
  const shown = Object.fromEntries(
    actions.flatMap((action) => (action.command ? [[action.id, actionKeys(action, commandKeys)]] : [])),
  )
  expect(shown).toEqual(SHOWN)
  expect(shown["next-file"]).toBe("]f")
  expect(shown["find-comments"]).toBe("gC")
  expect(shown["toggle-wrap"]).toBe("zw")
  expect(shown["find-files"]).toBe("Ctrl+f")
})
