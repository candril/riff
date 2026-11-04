import { test, expect, afterEach } from "bun:test"
import { KeyEvent } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { failOnKeymapErrors } from "../testing/keymap-errors"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { overviewState, prInfoPanelKeys } from "../testing/pr-info-panel-keys"
import { prInfo } from "../testing/pr-info"

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

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass with only the action
 * dispatch wired; anything else it calls throws, so a key that reaches
 * past executeAction shows up here.
 */
function keysOn(mounted: NonNullable<typeof app>, executeAction: (id: string) => void, cursorLine = 0) {
  const { ctx: render } = mounted
  // gB is the blame peek's toggle, which reads the cursor's line and asks for its blame.
  const blame = {
    source: {
      lineBlame: () => new Promise<never>(() => {}),
      fileBlame: () => Promise.reject(new Error("gB reads one line")),
    },
    splitRows: () => null,
  } as unknown as AppKeyContext["blame"]
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    activityFeed: mounted.activityFeed,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    linePeek: mounted.linePeek,
    blamePeek: mounted.blamePeek,
    prCommentInput: mounted.prCommentInput,
    chat: { state: mounted.chat, column: mounted.chatColumnState, input: mounted.chatColumn.input, atPicker: mounted.chatColumn.atPicker },
    prInfoFilter: mounted.prInfoFilter,
    getVimState: () => ({ ...createCursorState(), line: cursorLine }),
    getLineMapping: render.getLineMapping,
    blame,
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    executeAction: executeAction as AppKeyContext["executeAction"],
    // The review preview reads who you are on every key once a PR is loaded.
    reviewPreviewOpenContext: { getCachedCurrentUser: () => null } as unknown as AppKeyContext["reviewPreviewOpenContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      // The handler copies some of ctx into its own contexts when it is built; only a call counts.
      return () => {
        throw new Error(`the key path called ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", failOnKeymapErrors(createAppKeys(mounted.setup.renderer, ctx)))
}

test("gB in a PR's diff opens the blame peek, whichever case the terminal reports the shifted b in, and never riff board", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ appMode: "pr", prInfo: prInfo("") })
  const dispatched: string[] = []
  const hello = app.ctx.getLineMapping().allLines.findIndex((line) => line.content === '  return "hello"')
  keysOn(app, (id) => { dispatched.push(id) }, hello)
  const { mockInput, renderer } = app.setup

  // The mock always lowercases a shifted letter's name, so the uppercase report goes in by hand.
  await mockInput.typeText("g")
  renderer.keyInput.emit(
    "keypress",
    new KeyEvent({
      name: "B", sequence: "B", raw: "B", shift: true,
      ctrl: false, meta: false, option: false, number: false, eventType: "press", source: "raw",
    }),
  )
  expect(app.blamePeek.open()).toBe(true)
  expect(await app.frame()).toContain("Reading blame…")

  await mockInput.typeText("gB")
  expect(app.blamePeek.open()).toBe(false)
  await mockInput.typeText("gB")
  expect(app.blamePeek.open()).toBe(true)
  expect(dispatched).toEqual([])
})

test("gB in the feed dispatches nothing", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ appMode: "pr", prInfo: prInfo(""), viewMode: "feed" })
  const dispatched: string[] = []
  keysOn(app, (id) => { dispatched.push(id) })

  await app.setup.mockInput.typeText("gB")
  expect(dispatched).toEqual([])
  await app.frame()
})

test("gB and gb in the overview dispatch nothing, whichever case shift+b arrives in", async () => {
  const keys = await prInfoPanelKeys(overviewState())

  // The parser always lowercases a shifted letter's name, so the uppercase report goes in by hand.
  keys.press("g")
  keys.press("B", "B")
  keys.press("g")
  keys.press("B")
  keys.press("g")
  keys.press("b")
  expect(keys.calls).toEqual([])
})
