import { afterEach, expect, test } from "bun:test"
import { adoptReloadedState } from "../features/refresh/handlers"
import { createInitialState } from "../state"
import { mountApp, reloadCtx } from "../testing/app-render"
import { keysOn } from "../testing/chat-keys"
import { FEED_EVENTS } from "../testing/feed-keys"

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

// FEED_EVENTS' titles, one per row.
const TITLES = ["Rename this", "approved", "fix: hunks", "build"]

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/** riff on a PR's diff with the feed's events already in, so `a` asks gh for nothing. */
async function prApp() {
  app = await mountApp(DIFF, { width: 120, height: 30 })
  const mounted = app
  keysOn(mounted)
  mounted.activityFeed.setEvents(FEED_EVENTS)
  mounted.show({ appMode: "pr", viewMode: "diff", focusedPanel: "diff" })
  await mounted.frame()
  return mounted
}

const drawn = (frame: string) => TITLES.filter((title) => frame.includes(title))

test("/ in the feed narrows the drawn rows to what matches, Enter keeps the filter and Esc on a reopened prompt drops it", async () => {
  const mounted = await prApp()
  const { mockInput } = mounted.setup

  mockInput.pressKey("a")
  expect(mounted.ctx.getState().viewMode).toBe("feed")
  expect(drawn(await mounted.frame())).toEqual(TITLES)

  await mockInput.typeText("/")
  expect(mounted.activityFeed.filterInput()).toBe(true)
  await mockInput.typeText("hunks")
  expect(mounted.activityFeed.filter()).toBe("hunks")
  expect(drawn(await mounted.frame())).toEqual(["fix: hunks"])

  mockInput.pressEnter()
  expect(mounted.activityFeed.snapshot()).toMatchObject({ filterInput: false, filter: "hunks" })
  expect(drawn(await mounted.frame())).toEqual(["fix: hunks"])

  await mockInput.typeText("/")
  expect(mounted.activityFeed.filterInput()).toBe(true)
  mockInput.pressEscape()
  // A lone Esc is only told apart from the start of a sequence once the parser's wait is over.
  await Bun.sleep(50)
  expect(mounted.activityFeed.snapshot()).toMatchObject({ filterInput: false, filter: "" })
  expect(drawn(await mounted.frame())).toEqual(TITLES)
  expect(mounted.ctx.getState().viewMode).toBe("feed")
})

test("a reload keeps the feed's highlight and its type filter, and draws them", async () => {
  const mounted = await prApp()
  const { mockInput } = mounted.setup
  mockInput.pressKey("a")
  // Commits and comments only: Rename this and fix: hunks, the second highlighted.
  mockInput.pressKey("c")
  mockInput.pressKey("m")
  mockInput.pressKey("j")
  const before = mounted.activityFeed.snapshot()
  expect(before).toMatchObject({ highlightIndex: 1, types: new Set(["commit", "comment"]) })
  const frameBefore = await mounted.frame()
  expect(drawn(frameBefore)).toEqual(["Rename this", "fix: hunks"])

  adoptReloadedState(reloadCtx(mounted), (prev) => ({
    ...createInitialState(prev.files, prev.fileTree, prev.source, "reloaded"),
    appMode: "pr",
    viewMode: prev.viewMode,
  }))
  mounted.render()

  expect(mounted.activityFeed.snapshot()).toEqual(before)
  expect(await mounted.frame()).toEqual(frameBefore)
})
