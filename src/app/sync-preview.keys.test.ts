import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import type { SyncPreviewOpenContext } from "../features/sync-preview"

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
let live = false
afterEach(async () => {
  live = false
  await app?.dispose()
  app = null
})

/** The toast clears itself 3 s later, long after the app is disposed. */
function syncPreviewOn(mounted: NonNullable<typeof app>): SyncPreviewOpenContext {
  live = true
  return {
    getState: mounted.ctx.getState,
    setState: (update) => live && mounted.ctx.setState(update),
    render: () => live && mounted.render(),
  }
}

test("gs, which shares its g with gS, asks for the sync preview, never opens Submit Review, and the keys after it stay out of the summary", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysOn(app, { syncPreviewOpenContext: syncPreviewOn(app) })
  const { mockInput } = app.setup

  await mockInput.typeText("gs")

  expect(app.ctx.getState().reviewPreview.open).toBe(false)
  expect(app.ctx.getState().syncPreview.open).toBe(false)
  // Outside PR mode, as the harness is, the sync preview declines with a toast.
  expect(await app.frame()).toContain("Sync only available in PR mode")

  await mockInput.typeText("jk")

  expect(app.ctx.getState().reviewPreview.open).toBe(false)
  expect(app.islands.reviewPreview.summaryValue()).toBe("")
  expect(await app.frame()).not.toContain("Submit Review")
})
