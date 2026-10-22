import { afterEach, expect, test } from "bun:test"
import { mountApp } from "../testing/app-render"
import { ctrl, keysOn } from "../testing/chat-keys"
import { bgAt } from "../testing/frame"
import { FEED_EVENTS } from "../testing/feed-keys"
import { createFeedState } from "../state"

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

/**
 * riff on the feed with its events already in state, so nothing asks gh
 * for them, and its keys through the real createAppKeys.
 */
async function feedApp() {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  const mounted = app
  const selected: string[] = []
  // The real one loads the commit's diff and renders; the feed renders nothing itself on Enter.
  keysOn(mounted, {
    onCommitSelected: (sha) => {
      selected.push(String(sha))
      mounted.render()
    },
  })
  mounted.show({ appMode: "pr", viewMode: "feed", focusedPanel: "diff", feed: { ...createFeedState(), events: FEED_EVENTS } })
  await mounted.frame()
  return { mounted, selected }
}

/** The background behind a row's title, which the highlight paints. */
async function rowBackground(mounted: NonNullable<typeof app>, title: string) {
  const lines = (await mounted.frame()).split("\n")
  const y = lines.findIndex((line) => line.includes(title))
  expect(y).toBeGreaterThan(-1)
  return bgAt(mounted.setup.captureSpans(), lines[y]!.indexOf(title), y)
}

test("j moves the feed's highlight down a row", async () => {
  const { mounted } = await feedApp()
  const highlighted = await rowBackground(mounted, "Rename this")
  expect(await rowBackground(mounted, "approved")).not.toEqual(highlighted)

  mounted.setup.mockInput.pressKey("j")
  expect(await rowBackground(mounted, "approved")).toEqual(highlighted)
  expect(await rowBackground(mounted, "Rename this")).not.toEqual(highlighted)
})

test("Enter on a commit row leaves the feed for the diff scoped to that commit", async () => {
  const { mounted, selected } = await feedApp()
  expect(await mounted.frame()).toContain("fix: hunks")

  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("j")
  mounted.setup.mockInput.pressKey("RETURN")
  expect(selected).toEqual(["abc"])
  expect(mounted.ctx.getState().viewMode).toBe("diff")
  const frame = await mounted.frame()
  expect(frame).not.toContain("fix: hunks")
  expect(frame).toContain('return "hello"')
})

test("the command palette open over the feed takes its keys: down moves the palette, not the feed", async () => {
  const { mounted } = await feedApp()
  ctrl(mounted, "p")
  expect(mounted.actionMenu.open()).toBe(true)

  mounted.setup.mockInput.pressKey("ARROW_DOWN")
  expect(mounted.actionMenu.selectedIndex()).toBe(1)
  expect(mounted.ctx.getState().feed.highlightIndex).toBe(0)
  await mounted.frame()
})
