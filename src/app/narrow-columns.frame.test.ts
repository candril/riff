import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { DIFF_MIN_WIDTH } from "./column-widths"
import type { Comment } from "../types"

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

const COMMENT: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "say hello",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

test("at 80 columns with the tree, the threads and the chat open, the diff keeps its code readable and the columns stand side by side", async () => {
  app = await mountApp(DIFF, { width: 80, height: 24 })
  app.show({ comments: [COMMENT], showFilePanel: true })
  keysOn(app, { getCommentScope: app.ctx.split.commentScope })
  ctrl(app, "t")
  ctrl(app, "r")
  const drawn = await app.frame()

  const tree = app.fileTreePanel.host
  const diff = app.ctx.unified.island.host
  const threads = app.ctx.threadPanel.host
  const chat = app.chatColumn.host
  expect([tree.visible, threads.visible, chat.visible]).toEqual([true, true, true])
  expect(diff.width).toBeGreaterThanOrEqual(DIFF_MIN_WIDTH)
  expect(drawn).toContain('return "hello"')
  // Left to right and none over the next: tree, diff, threads, chat, all on the screen.
  expect(tree.x + tree.width).toBeLessThanOrEqual(diff.x)
  expect(diff.x + diff.width).toBeLessThanOrEqual(threads.x)
  expect(threads.width).toBeGreaterThan(0)
  expect(threads.x + threads.width).toBeLessThanOrEqual(chat.x)
  expect(chat.width).toBeGreaterThan(0)
  expect(chat.x + chat.width).toBeLessThanOrEqual(80)
})
