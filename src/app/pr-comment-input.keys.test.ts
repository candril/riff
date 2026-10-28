import { afterEach, beforeEach, expect, setSystemTime, test } from "bun:test"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState, type PRInfoPanelSection } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
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

const PROMPT = "Add PR Comment"
// The overview as pr-info-panel.keys.test.ts opens it, so the same four j's reach the conversation.
const OPENED_BEFORE: ReadonlySet<PRInfoPanelSection> = new Set(["checks", "description"])

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let panel: PRInfoPanelClass | null = null
let restoreColumns: (() => void) | null = null
// The panel's times read the clock.
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

/** riff on the PR overview with the cursor on the conversation's header, its keys through the real createAppKeys. */
async function onConversation() {
  app = await mountApp(DIFF, { width: 120, height: 40 })
  const mounted = app
  const info = fullPr()
  const shown = new PRInfoPanelClass(mounted.setup.renderer, info, mounted.ctx.getState().files, [], OPENED_BEFORE)
  panel = shown
  mounted.setPrInfoPanel(shown)
  keysOn(mounted, { getPrInfoPanel: () => shown })
  mounted.show({ appMode: "pr", prInfo: info, viewMode: "state", focusedPanel: "diff" })
  await mounted.frame()
  // The description's two lines and the previews lie between its header and the conversation's.
  for (let i = 0; i < 4; i++) mounted.setup.mockInput.pressKey("j")
  expect(shown.getActiveSection()).toBe("conversation")
  await mounted.frame()
  return mounted
}

test("c opens the prompt, what is typed shows in it, backspace deletes and Esc closes it", async () => {
  const mounted = await onConversation()
  expect(await mounted.frame()).not.toContain(PROMPT)

  mounted.setup.mockInput.pressKey("c")
  await mounted.setup.mockInput.typeText("hi")
  const typed = await mounted.frame()
  expect(typed).toContain(PROMPT)
  expect(typed).toMatch(/\bhi\b/)

  mounted.setup.mockInput.pressBackspace()
  expect(mounted.prCommentInput.current().text).toBe("h")
  const deleted = await mounted.frame()
  expect(deleted).toContain(PROMPT)
  expect(deleted).not.toMatch(/\bhi\b/)

  mounted.setup.mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(mounted.prCommentInput.isOpen()).toBe(false)
  expect(await mounted.frame()).not.toContain(PROMPT)
})

test("a reload closes the prompt and drops what was typed in it", async () => {
  const mounted = await onConversation()
  mounted.setup.mockInput.pressKey("c")
  await mounted.setup.mockInput.typeText("hi")
  expect(await mounted.frame()).toContain(PROMPT)

  adoptReloadedState(reloadCtx(mounted), (prev) => ({
    ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"),
    appMode: "pr",
    prInfo: prev.prInfo,
    viewMode: "state",
  }))
  mounted.render()

  expect(mounted.prCommentInput.current()).toEqual({ open: false, text: "", loading: false, error: null })
  expect(await mounted.frame()).not.toContain(PROMPT)
})
