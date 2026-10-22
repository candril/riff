import { test, expect, afterEach } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp } from "../testing/app-render"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { createSearchState } from "../vim-diff/search-state"
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

let app: Awaited<ReturnType<typeof mountApp>> | null = null
afterEach(async () => {
  await app?.dispose()
  app = null
})

/**
 * riff's key handler on the app's render pass, wired for the Submit Review
 * path only; anything else it calls throws, so a new dependency shows up
 * here. The PR operations have no PR to submit to, so confirming never
 * leaves the process.
 */
function keysOn(mounted: NonNullable<typeof app>) {
  const confirms: string[] = []
  const { ctx: render } = mounted
  const prOperationsContext = {
    getState: () => {
      confirms.push(mounted.reviewPreview.body())
      return render.getState()
    },
    setState: render.setState,
    render: mounted.render,
    source: "test",
    prInfo: null,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
  }
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    getVimState: () => createCursorState(),
    getFlashState: () => createFlashState(),
    getSearchState: () => createSearchState(),
    renderer: mounted.setup.renderer,
    render: mounted.render,
    reviewPreviewOpenContext: {
      reviewPreview: mounted.reviewPreview,
      render: mounted.render,
      getCachedCurrentUser: () => null,
      setCachedCurrentUser() {},
      mode: "local",
    },
    readReviewSummary: mounted.islands.reviewPreview.summaryValue,
    prOperationsContext,
  }
  const ctx = new Proxy(known, {
    get(target, name) {
      if (name in target) return target[name as keyof AppKeyContext]
      // The handler copies some of ctx into its own contexts when it is built; only a call counts.
      return () => {
        throw new Error(`the Submit Review path called ctx.${String(name)}`)
      }
    },
  }) as AppKeyContext
  mounted.setup.renderer.keyInput.on("keypress", createAppKeys(mounted.setup.renderer, ctx))
  return confirms
}

test("what is typed into the summary is the body Enter confirms, and the opening keys stay out of it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show()
  const confirms = keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("gS")
  expect(app.reviewPreview.open()).toBe(true)
  mockInput.pressTab()
  expect(await app.frame()).toContain("Summary (editing)")

  await mockInput.typeText("Ship it")
  expect(await app.frame()).toContain("Ship it")
  mockInput.pressEnter()

  expect(app.reviewPreview.body()).toBe("Ship it")
  expect(confirms).toEqual(["Ship it"])
  expect(app.islands.reviewPreview.summaryValue()).toBe("Ship it")
})

const local = (id: string, line: number, body: string): Comment => ({
  id,
  filename: "src/greet.ts",
  line,
  side: "RIGHT",
  body,
  createdAt: "2026-01-10T10:00:00Z",
  status: "local",
})

test("gS opens Submit Review, its keys pick the type, leave a comment out and move to the summary, and Esc closes it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.show({ comments: [local("c1", 2, "Louder"), local("c2", 3, "Brace")] })
  keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("gS")
  expect(app.reviewPreview.open()).toBe(true)
  let screen = await app.frame()
  expect(screen).toContain("Submit Review")
  expect(screen).toContain("Comments (2/2)")
  expect(screen).toContain("✓ greet.ts:2 Louder")

  await mockInput.typeText("2")
  expect(app.reviewPreview.selectedEvent()).toBe("APPROVE")

  await mockInput.typeText("j")
  expect(app.reviewPreview.highlightedIndex()).toBe(1)
  await mockInput.typeText(" ")
  expect([...app.reviewPreview.excludedCommentIds()]).toEqual(["c2"])
  screen = await app.frame()
  expect(screen).toContain("Comments (1/2)")
  expect(screen).toContain("○ greet.ts:3 Brace")

  mockInput.pressTab()
  expect(app.reviewPreview.focusedSection()).toBe("input")
  expect(await app.frame()).toContain("Summary (editing)")
  await mockInput.typeText("Nice")
  expect(app.reviewPreview.body()).toBe("Nice")
  expect(app.reviewPreview.selectedEvent()).toBe("APPROVE")

  mockInput.pressEscape()
  await Bun.sleep(50)
  expect(app.reviewPreview.open()).toBe(false)
  expect(await app.frame()).not.toContain("Submit Review")
})
