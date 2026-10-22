import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { openInlineCommentOverlay } from "../state"
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
diff --git a/src/part.ts b/src/part.ts
index 1111111..2222222 100644
--- a/src/part.ts
+++ b/src/part.ts
@@ -1,3 +1,3 @@
 export function part() {
-  return "bye"
+  return "farewell"
 }
`

const WATERMARK = { lastVisitAt: "2026-01-02T00:00:00Z", lastSeenHeadSha: "", seenCommentIds: [] }

const fresh: Comment = {
  id: "fresh",
  filename: "src/greet.ts",
  line: 2,
  side: "RIGHT",
  body: "arrived since your visit",
  createdAt: "2026-01-03T00:00:00Z",
  status: "synced",
  author: "ana",
}

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

async function prApp() {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  app.show({ appMode: "pr", comments: [fresh], showFilePanel: true, focusedPanel: "diff" })
  return app
}

/** The tree's row for `name`: the sidebar is the frame's first 34 columns. */
const treeLine = (frame: string, name: string) =>
  frame.split("\n").map((line) => line.slice(0, 34)).find((line) => line.includes(` ${name}`)) ?? ""

test("with a watermark, the tree marks the file with the unseen comment, and the thread panel showing it marks it seen", async () => {
  const mounted = await prApp()
  mounted.visit.begin(WATERMARK, false)
  mounted.render()
  const frame = await mounted.frame()
  expect(treeLine(frame, "greet.ts")).toContain("●")
  expect(treeLine(frame, "part.ts")).not.toContain("●")
  expect(mounted.visit.seen().size).toBe(0)

  mounted.show(openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"))
  await mounted.frame()
  expect([...mounted.visit.seen()]).toEqual(["fresh"])
})

test("without a watermark nothing is marked unseen, and nothing on screen is noted as seen", async () => {
  const mounted = await prApp()
  mounted.show(openInlineCommentOverlay(mounted.ctx.getState(), "src/greet.ts", 2, "RIGHT", "view"))
  const frame = await mounted.frame()
  expect(frame).toContain("arrived since your visit")
  expect(treeLine(frame, "greet.ts")).not.toContain("●")
  expect(mounted.visit.seen().size).toBe(0)
})
