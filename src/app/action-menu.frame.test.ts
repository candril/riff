import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"

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

test("the command palette offers no Claude handoff: the chat column took its place", async () => {
  app = await mountApp(DIFF, { width: 120, height: 60 })
  const initial = app.ctx.getState().actionMenu
  app.show({ actionMenu: { ...initial, open: true } })
  const frame = await app.frame()
  expect(frame).toContain("Commands")
  // The Claude group sorted first, so its absence leaves GitHub at the head of the list.
  const groups = frame.split("\n").map((line) => line.trim()).filter((line) => ["GitHub", "Navigation"].includes(line))
  expect(groups).toEqual(["GitHub", "Navigation"])
  expect(frame).not.toContain("Claude")
})
