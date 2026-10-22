import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { fgAt, ints } from "../testing/frame"
import { theme } from "../theme"
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
  { sha: "eee5555", message: "sketch the greeter", author: "you", date: "2026-09-11T06:00:00Z" },
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
  app.commitPicker.show(null, commits)
  app.render()
  const { mockInput } = app.setup

  await mockInput.typeText("/")
  await mockInput.typeText("wave")
  expect(app.commitPicker.query()).toBe("wave")
  const narrowed = await app.frame()
  // The field's own row, apart from the commit rows it narrowed.
  expect(narrowed.split("\n").some((line) => line.includes("wave") && !/hello|goodbye/.test(line))).toBe(true)
  expect(narrowed).toContain("wave hello")
  expect(narrowed).toContain("wave goodbye")
  expect(narrowed).not.toContain("start the greeter")

  mockInput.pressEnter()
  expect(app.commitPicker.queryInput()).toBe(false)
  // Narrowing puts the cursor on the first match, so j is the second.
  await mockInput.typeText("j")
  mockInput.pressEnter()

  expect(selected).toEqual(["ccc3333"])
  expect(app.commitPicker.open()).toBe(false)
})

/** Each commit row's message as drawn, and whether it wears the marked rows' peach. */
function markedRows(mounted: NonNullable<typeof app>) {
  const lines = mounted.setup.captureCharFrame().split("\n")
  const spans = mounted.setup.captureSpans()
  const peach = String(ints(theme.peach))
  return Object.fromEntries(
    commits.flatMap(({ sha, message }) => {
      const y = lines.findIndex((line) => line.includes(`${sha}  ${message}`))
      if (y === -1) return []
      return [[message, String(fgAt(spans, lines[y]!.indexOf(message), y)) === peach]]
    }),
  )
}

test("Ctrl-g opens the picker on the scope's marks, space and V mark rows in the frame, and Esc takes it off the screen", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ commits, viewingCommit: "ddd4444", viewingCommitScope: ["ddd4444", "eee5555"] })
  keysOn(app, { onCommitSelected: () => {} })
  app.render()
  const { mockInput } = app.setup

  mockInput.pressKey("g", { ctrl: true })
  let frame = await app.frame()
  expect(app.commitPicker.open()).toBe(true)
  expect(frame).toContain("All commits")
  expect(markedRows(app)).toEqual({
    "polish the greeting": false,
    "wave hello": false,
    "wave goodbye": false,
    "start the greeter": true,
    "sketch the greeter": true,
  })

  await mockInput.typeText("kkk")
  await mockInput.typeText(" ")
  await app.frame()
  expect(markedRows(app)).toMatchObject({ "polish the greeting": true, "wave hello": false })

  await mockInput.typeText("j")
  await mockInput.typeText("V")
  await app.frame()
  expect(markedRows(app)).toMatchObject({ "wave hello": true, "wave goodbye": false })
  await mockInput.typeText("j")
  await app.frame()
  expect(markedRows(app)).toEqual({
    "polish the greeting": true,
    "wave hello": true,
    "wave goodbye": true,
    "start the greeter": true,
    "sketch the greeter": true,
  })

  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  frame = await app.frame()
  expect(app.commitPicker.open()).toBe(false)
  expect(frame).not.toContain("All commits")
  expect(frame).not.toContain("wave goodbye")
})
