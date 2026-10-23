import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { prInfo } from "../testing/pr-info"
import { moveInlineCommentOverlayHighlight, openInlineCommentOverlay } from "../state"
import type { Comment } from "../types"

const FILE = `diff --git a/src/greet.ts b/src/greet.ts
new file mode 100644
index 0000000..2222222
--- /dev/null
+++ b/src/greet.ts
@@ -0,0 +1,4 @@
${Array.from({ length: 4 }, (_, i) => `+export const line${i + 1} = ${i + 1}`).join("\n")}
`

function comment(id: string, githubId: number, author: string, body: string): Comment {
  return {
    id,
    githubId,
    filename: "src/greet.ts",
    line: 2,
    side: "RIGHT",
    body,
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    author,
    ...(id === "reply" ? { inReplyTo: "root" } : {}),
  }
}

const THREAD = [comment("root", 11, "ana", "a question on two"), comment("reply", 22, "bo", "an answer on two")]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** The thread panel open on line 2 in a PR, highlighted on bo's reply. */
async function onReply() {
  app = await mountApp(FILE, { width: 140, height: 30 })
  app.show({ appMode: "pr", prInfo: prInfo(""), comments: THREAD, selectedFileIndex: 0 })
  const keys = keysOn(app)
  app.ctx.setState((s) => moveInlineCommentOverlayHighlight(openInlineCommentOverlay(s, "src/greet.ts", 2, "RIGHT"), 1))
  await app.frame()
  expect(app.ctx.getState().focusedPanel).toBe("comments")
  expect(app.ctx.getState().inlineCommentOverlay.highlightedIndex).toBe(1)
  return { mounted: app, keys }
}

test("React… after a thread-panel filter acts on the comment highlighted now", async () => {
  const { mounted } = await onReply()
  const { mockInput } = mounted.setup

  await mockInput.typeText("/")
  await mockInput.typeText("on two")
  mockInput.pressEnter()
  expect(mounted.ctx.getState().inlineCommentOverlay.filter).toBe("on two")
  expect(mounted.ctx.getState().inlineCommentOverlay.highlightedIndex).toBe(0)

  await mockInput.typeText("+")
  const frame = await mounted.frame()
  expect(frame).toContain("React on src/greet.ts:2 (@ana)")
  expect(frame).not.toContain("(@bo)")
})

test("the palette offers React… in the thread panel and not in the feed", async () => {
  const { mounted } = await onReply()
  const { mockInput } = mounted.setup
  const paletteFor = async () => {
    mockInput.pressKey("p", { ctrl: true })
    await mockInput.typeText("React")
    const frame = await mounted.frame()
    mounted.actionMenu.close()
    return frame
  }

  expect(await paletteFor()).toContain("React…")

  mounted.show({ viewMode: "feed", focusedPanel: "diff" })
  expect(await paletteFor()).not.toContain("React…")
})
