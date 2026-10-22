import { test, expect, afterEach } from "bun:test"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
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

const DECLINED = "Sync only available in PR mode"

let app: Awaited<ReturnType<typeof mountApp>> | null = null
let live = false
afterEach(async () => {
  live = false
  await app?.dispose()
  app = null
})

/** `gs` outside PR mode, which the harness is in, declines with a toast that clears itself 3 s later. */
async function toasted() {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const mounted = app
  live = true
  keysOn(mounted, {
    syncPreviewOpenContext: {
      getState: mounted.ctx.getState,
      setState: mounted.ctx.setState,
      // The toast's own timer fires long after this app is gone.
      render: () => live && mounted.render(),
      toast: mounted.toast,
      syncPreview: mounted.syncPreview,
    },
  })
  await mounted.setup.mockInput.typeText("gs")
  return mounted
}

test("a key that toasts draws the toast, and clearing it takes it off the screen", async () => {
  const mounted = await toasted()
  expect(mounted.toast.current()).toEqual({ message: DECLINED, type: "error" })
  expect(await mounted.frame()).toContain(DECLINED)

  mounted.toast.clear()
  mounted.render()
  expect(await mounted.frame()).not.toContain(DECLINED)
})

test("a reload takes down the toast shown before it", async () => {
  const mounted = await toasted()
  expect(await mounted.frame()).toContain(DECLINED)

  adoptReloadedState(reloadCtx(mounted), (prev) => createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"))
  mounted.render()

  expect(mounted.toast.current()).toBeNull()
  expect(await mounted.frame()).not.toContain(DECLINED)
})
