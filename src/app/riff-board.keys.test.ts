import { test, expect, afterEach } from "bun:test"
import { KeyEvent } from "@opentui/core"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
import { openPrInBoard } from "../features/riff-board"
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
function keysOn(mounted: NonNullable<typeof app>, executeAction: (id: string) => void) {
  const { ctx: render } = mounted
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
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
    getVimState: () => createCursorState(),
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    executeAction: executeAction as AppKeyContext["executeAction"],
    // An unbound chord falls through to the diff's vim keys; swallowing it there keeps plain gb inert.
    vimHandler: { handleKey: () => true } as unknown as AppKeyContext["vimHandler"],
    // The review preview reads who you are on every key once a PR is loaded.
    reviewPreviewOpenContext: { getCachedCurrentUser: () => null } as unknown as AppKeyContext["reviewPreviewOpenContext"],
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      // The handler copies some of ctx into its own contexts when it is built; only a call counts.
      return () => {
        throw new Error(`the gB path called ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
}

test("gB dispatches open-in-board, whichever case the terminal reports the shifted b in", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const dispatched: string[] = []
  keysOn(app, (id) => { dispatched.push(id) })
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
  expect(dispatched).toEqual(["open-in-board"])

  await mockInput.typeText("gB")
  expect(dispatched).toEqual(["open-in-board", "open-in-board"])

  await mockInput.typeText("gb")
  expect(dispatched).toEqual(["open-in-board", "open-in-board"])
  // Let the render the keys queued land before dispose tears the scene down under it.
  await app.frame()
})

test("gB outside a PR leaves the browser alone and says riff board is for PRs", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const opened: string[] = []
  const mounted = app
  keysOn(app, (id) => {
    if (id !== "open-in-board") throw new Error(`unexpected action ${id}`)
    openPrInBoard({
      getState: mounted.ctx.getState,
      setState: mounted.ctx.setState,
      // The toast clears two seconds on, long after this app is gone; drawing it then would land in another test.
      render: () => { if (!mounted.setup.renderer.isDestroyed) mounted.render() },
      openUrl: (url) => { opened.push(url); return true },
      boardUrl: "http://localhost:4477",
      location: () => {
        throw new Error("asked where the reader is with no PR to open")
      },
    })
  })

  await app.setup.mockInput.typeText("gB")
  expect(await app.frame()).toContain("riff board opens GitHub PRs only")
  expect(opened).toEqual([])
})

test("gB in the feed dispatches the same open-in-board as everywhere else", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ appMode: "pr", prInfo: prInfo(""), viewMode: "feed" })
  const dispatched: string[] = []
  keysOn(app, (id) => { dispatched.push(id) })

  await app.setup.mockInput.typeText("gB")
  expect(dispatched).toEqual(["open-in-board"])
  await app.frame()
})

test("gB in the overview dispatches open-in-board, whichever case shift+b arrives in, and plain gb does nothing", async () => {
  const keys = await prInfoPanelKeys(overviewState())

  // The parser always lowercases a shifted letter's name, so the uppercase report goes in by hand.
  keys.press("g")
  keys.press("B", "B")
  expect(keys.calls).toEqual(["action open-in-board"])
  keys.press("g")
  keys.press("B")
  expect(keys.calls).toEqual(["action open-in-board", "action open-in-board"])
  keys.press("g")
  keys.press("b")
  expect(keys.calls).toEqual(["action open-in-board", "action open-in-board"])
})
