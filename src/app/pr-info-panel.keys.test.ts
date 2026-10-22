import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { pinStdoutColumns } from "../testing/frame"
import { PR_NOW } from "../testing/pr-info"
import { fullPr } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "../components/PRInfoPanel"

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
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null
// The panel's times read the clock and its rows are cut to the terminal's width.
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

/** riff on the PR overview, its keys through the real createAppKeys. */
async function overviewApp() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = fullPr()
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [])
  panel = shown
  mounted.setPrInfoPanel(shown)
  const flashes: string[] = []
  keysOn(mounted, {
    getPrInfoPanel: () => shown,
    flashHandler: {
      startList: (surface: string) => void flashes.push(surface),
    } as unknown as AppKeyContext["flashHandler"],
  })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  await mounted.frame()
  return { mounted, flashes }
}

test("za folds the description the cursor starts on", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).toContain("▼  Description (2)")

  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  const frame = await mounted.frame()
  expect(frame).toContain("▶  Description (2)  2 lines")
  expect(frame).not.toContain("Second line with code.")
})

test("j walks through the description's two lines down to the checks, k back up to the previews, and za unfolds where it lands", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).toContain("▶  Checks (6)")

  for (let i = 0; i < 4; i++) mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  expect(await mounted.frame()).toContain("▼  Checks (6)")

  mounted.setup.mockInput.pressKey("k")
  mounted.setup.mockInput.pressKey("z")
  mounted.setup.mockInput.pressKey("a")
  expect(await mounted.frame()).toContain("▼  Previews (0)")
})

test("/ opens the overview's filter prompt", async () => {
  const { mounted } = await overviewApp()
  expect(await mounted.frame()).not.toContain("/filter rows…")

  mounted.setup.mockInput.pressKey("/")
  expect(await mounted.frame()).toContain("/filter rows…")
})

test("Ctrl-r still opens the chat from the overview, and a bare s still starts flash on it", async () => {
  const { mounted, flashes } = await overviewApp()
  mounted.setup.mockInput.pressKey("s")
  expect(flashes).toEqual(["state"])

  ctrl(mounted, "r")
  expect(mounted.ctx.getState().chatOpen).toBe(true)
  expect(mounted.ctx.getState().focusedPanel).toBe("chat")
  await mounted.frame()
})
