import { test, expect, afterEach } from "bun:test"
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

// The header formats the time in the machine's locale and zone, so the test does too.
const shown = (iso: string) => `↻ ${new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("the header shows the refresh time off its factory, and a stamp moves it", async () => {
  let now = "2026-01-01T10:00:00Z"
  app = await mountApp(DIFF, { width: 120, height: 12, refreshClock: () => now })
  app.show()
  const header = (frame: string) => frame.split("\n")[0]!
  expect(header(await app.frame())).toContain(shown("2026-01-01T10:00:00Z"))

  now = "2026-01-01T13:47:00Z"
  app.lastRefresh.stamp()
  app.render()
  const after = header(await app.frame())
  expect(after).toContain(shown("2026-01-01T13:47:00Z"))
  expect(after).not.toContain(shown("2026-01-01T10:00:00Z"))
})
