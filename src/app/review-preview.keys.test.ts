import { test, expect, afterEach } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"

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
 * riff's key handler on the app's render pass, wired for the Submit Review
 * path only; anything else it calls throws, so a new dependency shows up
 * here. The PR operations have no PR to submit to, so confirming never
 * leaves the process.
 */
function keysOn(mounted: NonNullable<typeof app>) {
  const confirms: string[] = []
  const { ctx: render } = mounted
  const prOperationsContext = {
    getState: () => {
      confirms.push(render.getState().reviewPreview.body)
      return render.getState()
    },
    setState: render.setState,
    render: mounted.render,
    source: "test",
    prInfo: null,
    syncPreview: mounted.syncPreview,
  }
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    getVimState: () => createCursorState(),
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    reviewPreviewOpenContext: {
      getState: render.getState,
      setState: render.setState,
      render: mounted.render,
      getCachedCurrentUser: () => null,
      setCachedCurrentUser() {},
      mode: "local",
    },
    readReviewSummary: mounted.islands.reviewPreview.summaryValue,
    prOperationsContext,
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      // The handler copies some of ctx into its own contexts when it is built; only a call counts.
      return () => {
        throw new Error(`the Submit Review path called ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
  return confirms
}

test("what is typed into the summary is the body Enter confirms, and the opening keys stay out of it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const confirms = keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("gS")
  expect(app.ctx.getState().reviewPreview.open).toBe(true)
  mockInput.pressTab()
  expect(await app.frame()).toContain("Summary (editing)")

  await mockInput.typeText("Ship it")
  expect(await app.frame()).toContain("Ship it")
  mockInput.pressEnter()

  expect(app.ctx.getState().reviewPreview.body).toBe("Ship it")
  expect(confirms).toEqual(["Ship it"])
  expect(app.islands.reviewPreview.summaryValue()).toBe("Ship it")
})
