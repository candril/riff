import { test, expect, afterEach } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import type { Comment } from "../types"
import type { FeedEvent } from "../utils/feed"

const DIFF = `diff --git a/src/greet.ts b/src/greet.ts
index 1111111..2222222 100644
--- a/src/greet.ts
+++ b/src/greet.ts
@@ -1,1 +1,1 @@
-  return "hi"
+  return "hello"
`

const COMMENT: Comment = {
  id: "c1",
  filename: "src/greet.ts",
  line: 1,
  side: "RIGHT",
  body: "say hello to the reader",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  author: "ana",
}

const EVENT: FeedEvent = {
  id: "e1",
  type: "commit",
  at: "2026-01-01T00:00:00Z",
  actor: "ana",
  lead: "a1b2c3d",
  title: "fix: greet the reader properly",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

// Both follow the frame now: what a key changes is drawn by the pass it renders.
test("Ctrl-t draws the thread panel and q takes it away; a and d draw the feed and leave it", async () => {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ comments: [COMMENT] })
  keysOn(app, { getCommentScope: app.ctx.split.commentScope })

  expect(await app.frame()).not.toContain("say hello to the reader")

  ctrl(app, "t")
  expect(app.ctx.threadPanel.host.visible).toBe(true)
  let drawn = await app.frame()
  expect(drawn).toMatch(/all files\s+1 comment/)
  expect(drawn).toContain("say hello to the reader")

  await app.setup.mockInput.typeText("q")
  expect(app.ctx.getState().inlineCommentOverlay.open).toBe(false)
  expect(app.ctx.threadPanel.host.visible).toBe(false)
  drawn = await app.frame()
  expect(drawn).not.toContain("say hello to the reader")
  expect(drawn).not.toMatch(/all files\s+1 comment/)

  app.show({ appMode: "pr", feed: { ...app.ctx.getState().feed, events: [EVENT] } })
  await app.setup.mockInput.typeText("a")
  expect(app.ctx.getState().viewMode).toBe("feed")
  drawn = await app.frame()
  expect(drawn).toContain("fix: greet the reader properly")

  await app.setup.mockInput.typeText("d")
  expect(app.ctx.getState().viewMode).toBe("diff")
  drawn = await app.frame()
  expect(drawn).not.toContain("fix: greet the reader properly")
  expect(drawn).toContain("hello")
})
