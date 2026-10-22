import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
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

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("g? opens the help through its capture, j scrolls it, and g? or q closes it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 24 })
  app.show()
  const { quits } = keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("g?")
  const opened = await app.frame()
  expect(opened).toContain("Keyboard Shortcuts")
  expect(opened).toContain("g? or Esc to close")
  expect(opened).not.toContain("↑ more")

  await mockInput.typeText("j")
  const scrolled = await app.frame()
  expect(scrolled).toContain("↑ more")
  expect(scrolled).not.toBe(opened)

  await mockInput.typeText("g?")
  expect(app.help.open()).toBe(false)
  expect(await app.frame()).not.toContain("Keyboard Shortcuts")

  await mockInput.typeText("g?")
  expect(await app.frame()).toContain("Keyboard Shortcuts")
  await mockInput.typeText("q")
  expect(app.help.open()).toBe(false)
  expect(await app.frame()).not.toContain("Keyboard Shortcuts")
  expect(quits).toEqual([])
})

test("Submit Review opened over the help by gS types the keys the help would take, j and q among them", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("g?")
  await mockInput.typeText("gS")
  expect(app.reviewPreview.open()).toBe(true)
  mockInput.pressTab()
  await app.frame()
  expect(app.reviewPreview.focusedSection()).toBe("input")
  await mockInput.typeText("jq")

  expect(app.islands.reviewPreview.summaryValue()).toBe("jq")
  expect([app.help.open(), app.help.scroll()]).toEqual([true, 0])
})
