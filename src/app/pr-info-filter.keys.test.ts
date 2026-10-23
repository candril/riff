import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { mountApp, reloadCtx } from "../testing/app-render"
import { adoptReloadedState } from "../features/refresh/handlers"
import { keysOn } from "../testing/chat-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"
import { handleOpenPRInfoPanel } from "../features/pr-info-panel"
import * as viewFilter from "./view-filter"
import { createInitialState, type PRInfoPanelSection } from "../state"

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

const OPENED_BEFORE: ReadonlySet<PRInfoPanelSection> = new Set(["checks", "description"])

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null
beforeEach(() => {
  setSystemTime(PR_NOW)
  restoreColumns = pinStdoutColumns(120)
})
afterEach(async () => {
  panel?.destroy()
  panel = null
  await app?.dispose()
  app = null
  restoreColumns?.()
  setSystemTime()
})

/** riff on the PR overview, its keys through the real createAppKeys and its filter field wired as app.ts wires it. */
async function overviewApp() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = fullPr()
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], OPENED_BEFORE)
  panel = shown
  mounted.setPrInfoPanel(shown)
  const filterCtx = { getState: mounted.ctx.getState, setState: mounted.ctx.setState, feed: mounted.activityFeed, prInfoFilter: mounted.prInfoFilter }
  shown.setOnFilterChange((value) => {
    viewFilter.setFilter(filterCtx, value)
    mounted.render()
  })
  keysOn(mounted, {
    getPrInfoPanel: () => shown,
    prInfoPanelOpenContext: {
      getState: mounted.ctx.getState,
      setState: mounted.ctx.setState,
      render: mounted.render,
      commentInput: mounted.prCommentInput,
      prInfoFilter: mounted.prInfoFilter,
    },
  })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  await mounted.frame()
  return mounted
}

const PROMPT = "/filter rows…"

test("/ and typing narrow the overview's rows and show the text in the prompt, and Esc drops it", async () => {
  const mounted = await overviewApp()
  const unfiltered = await mounted.frame()
  expect(unfiltered).toContain("✓ build")
  expect(unfiltered).not.toContain(PROMPT)

  mounted.setup.mockInput.pressKey("/")
  expect(await mounted.frame()).toContain(PROMPT)
  await mounted.setup.mockInput.typeText("greet")
  const narrowed = await mounted.frame()
  expect(narrowed).toContain("/greet")
  expect(narrowed).toContain("src/greet.ts")
  expect(narrowed).not.toContain("✓ build")
  expect(narrowed).toContain("No commits")

  mounted.setup.mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  const dropped = await mounted.frame()
  expect(dropped).not.toContain("/greet")
  expect(dropped).toContain("✓ build")
  expect({ filter: mounted.prInfoFilter.filter(), filterInput: mounted.prInfoFilter.filterInput() }).toEqual({ filter: "", filterInput: false })
})

test("a filter kept with Enter is gone once the overview is left and entered again, and / starts empty", async () => {
  const mounted = await overviewApp()
  mounted.setup.mockInput.pressKey("/")
  await mounted.setup.mockInput.typeText("greet")
  mounted.setup.mockInput.pressEnter()
  const kept = await mounted.frame()
  expect(kept).not.toContain("✓ build")
  expect(mounted.prInfoFilter.filter()).toBe("greet")

  mounted.setup.mockInput.pressKey("d")
  await mounted.frame()
  expect(mounted.ctx.getState().viewMode).toBe("diff")
  mounted.setup.mockInput.pressKey("g")
  mounted.setup.mockInput.pressKey("i")
  const entered = await mounted.frame()
  expect(mounted.ctx.getState().viewMode).toBe("state")
  expect(entered).toContain("✓ build")

  mounted.setup.mockInput.pressKey("/")
  const reopened = await mounted.frame()
  expect(reopened).toContain(PROMPT)
  expect(reopened).not.toContain("/greet")
  expect(reopened).toContain("✓ build")
})

test("/ on a filter kept with Enter draws the prompt on its text over the narrowed rows", async () => {
  const mounted = await overviewApp()
  mounted.setup.mockInput.pressKey("/")
  await mounted.setup.mockInput.typeText("greet")
  mounted.setup.mockInput.pressEnter()
  const kept = await mounted.frame()
  expect(kept).not.toContain(PROMPT)
  expect(kept).not.toContain("✓ build")

  mounted.setup.mockInput.pressKey("/")
  const reopened = await mounted.frame()
  expect(reopened).toContain("/greet")
  expect(reopened).toContain("src/greet.ts")
  expect(reopened).not.toContain("✓ build")
  expect({ filter: mounted.prInfoFilter.filter(), filterInput: mounted.prInfoFilter.filterInput() }).toEqual({ filter: "greet", filterInput: true })
})

test("a reload keeps the filter's text and its open prompt, and the rows stay narrowed", async () => {
  const mounted = await overviewApp()
  mounted.setup.mockInput.pressKey("/")
  await mounted.setup.mockInput.typeText("greet")
  expect(await mounted.frame()).toContain("/greet")

  adoptReloadedState(reloadCtx(mounted), (prev) => ({
    ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"),
    appMode: "pr",
    prInfo: prev.prInfo,
    viewMode: "state",
  }))
  mounted.render()

  expect({ filter: mounted.prInfoFilter.filter(), filterInput: mounted.prInfoFilter.filterInput() }).toEqual({ filter: "greet", filterInput: true })
  const reloaded = await mounted.frame()
  expect(reloaded).toContain("/greet")
  expect(reloaded).not.toContain("✓ build")
})
