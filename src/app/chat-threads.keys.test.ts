import { afterEach, expect, test } from "bun:test"
import type { Comment } from "../types"
import { mountApp } from "../testing/app-render"
import { keysOn, moveTo, openChat } from "../testing/chat-keys"

const THREE_ADDED = `diff --git a/src/sum.ts b/src/sum.ts
index 1111111..2222222 100644
--- a/src/sum.ts
+++ b/src/sum.ts
@@ -1,2 +1,5 @@
 export function sum() {
+  const b = 2
+  const c = 3
+  const d = 4
   return 1
`

const review = (fields: Partial<Comment> & Pick<Comment, "id" | "body">): Comment => ({
  filename: "src/sum.ts",
  line: 3,
  side: "RIGHT",
  createdAt: "2026-10-01T10:00:00Z",
  status: "synced",
  author: "bob",
  ...fields,
})

const COMMENTS = [
  review({ id: "on-c", body: "c should be computed, not a literal." }),
  review({ id: "on-file", line: 0, body: "Split this module." }),
]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function mounted() {
  app = await mountApp(THREE_ADDED, { width: 140, height: 24 })
  app.show({ comments: COMMENTS })
  return app
}

async function ask(question: string) {
  openChat(app!)
  await app!.setup.mockInput.typeText(question)
  app!.setup.mockInput.pressEnter()
  const frame = await app!.frame()
  const lines = frame.split("\n")
  return { received: app!.agent.received[0]!, label: lines[lines.findIndex((l) => l.includes(`› ${question}`)) - 1]! }
}

test("a question on a line with a thread carries that thread, and the chat says one went", async () => {
  const app = await mounted()
  const { vimState } = keysOn(app)
  moveTo(app, vimState, "  const c = 3")

  const { received, label } = await ask("is he right?")
  expect(received).toContain("[Thread on-c on src/sum.ts:3 (open)]\n--- bob, 2026-10-01\nc should be computed, not a literal.")
  expect(received).not.toContain("Split this module.")
  expect(received.indexOf("[Reviewer's position:")).toBeLessThan(received.indexOf("[Thread on-c"))
  expect(label).toContain("src/sum.ts:3  1 thread")
})

test("a question from the file header carries every thread of the file", async () => {
  const app = await mounted()
  const { vimState } = keysOn(app)
  expect(app.ctx.getLineMapping().getLine(vimState().line)?.type).toBe("file-header")

  const { received, label } = await ask("what do they want?")
  expect(received).toContain("[Thread on-file on src/sum.ts (file) (open)]\n--- bob, 2026-10-01\nSplit this module.")
  expect(received).toContain("[Thread on-c on src/sum.ts:3 (open)]")
  expect(label).toContain("2 threads")
})

test("a question on a line with no thread carries none", async () => {
  const app = await mounted()
  const { vimState } = keysOn(app)
  moveTo(app, vimState, "  const d = 4")

  const { received, label } = await ask("and here?")
  expect(received).not.toContain("[Thread")
  expect(label).toContain("src/sum.ts:4")
  expect(label).not.toContain("thread")
})
