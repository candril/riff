import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { openCommitPicker } from "../state"
import type { PrCommit } from "../providers/github/types"

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

const commits: PrCommit[] = [
  { sha: "aaa1111", message: "polish the greeting", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "wave hello", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "wave goodbye", author: "you", date: "2026-09-11T08:00:00Z" },
  { sha: "ddd4444", message: "start the greeter", author: "you", date: "2026-09-11T07:00:00Z" },
]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("the commit picker's `/` field types the query through the keymap, and Enter picks from what it narrowed", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ commits })
  const selected: (string | null)[] = []
  keysOn(app, { onCommitSelected: (sha) => void selected.push(sha) })
  app.ctx.setState(openCommitPicker)
  app.render()
  const { mockInput } = app.setup

  await mockInput.typeText("/")
  await mockInput.typeText("wave")
  expect(app.ctx.getState().commitPicker.query).toBe("wave")
  const narrowed = await app.frame()
  // The field's own row, apart from the commit rows it narrowed.
  expect(narrowed.split("\n").some((line) => line.includes("wave") && !/hello|goodbye/.test(line))).toBe(true)
  expect(narrowed).toContain("wave hello")
  expect(narrowed).toContain("wave goodbye")
  expect(narrowed).not.toContain("start the greeter")

  mockInput.pressEnter()
  expect(app.ctx.getState().commitPicker.queryInput).toBe(false)
  // Narrowing puts the cursor on the first match, so j is the second.
  await mockInput.typeText("j")
  mockInput.pressEnter()

  expect(selected).toEqual(["ccc3333"])
  expect(app.ctx.getState().commitPicker.open).toBe(false)
})
