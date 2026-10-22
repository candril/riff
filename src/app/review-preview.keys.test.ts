import { test, expect, afterEach } from "bun:test"
import type { AppKeyContext } from "./key-context"
import { createAppKeys } from "./keys"
import { mountApp, reloadCtx } from "../testing/app-render"
import { adoptReloadedState } from "../features/refresh/handlers"
import type { PendingReview } from "../providers/github/types"
import type { PrOperationsContext, ReviewCalls } from "../features/pr-operations"
import { withPendingComments } from "../state"
import { prInfo } from "../testing/pr-info"
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
 * here. The PR operations have no PR to submit to unless a test hands one in
 * with its own calls, so confirming never leaves the process.
 */
function keysOn(mounted: NonNullable<typeof app>, prOperations: Partial<PrOperationsContext> = {}) {
  const confirms: string[] = []
  const { ctx: render } = mounted
  const unreachable = () => {
    throw new Error("the review submit reached gh")
  }
  const prOperationsContext: PrOperationsContext = {
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
    pendingReview: mounted.pendingReview,
    toast: mounted.toast,
    reviewCalls: {
      getPrHeadSha: unreachable,
      submitReview: unreachable,
      getCurrentUser: unreachable,
      getPrComments: unreachable,
      saveComment: unreachable,
    },
    ...prOperations,
  }
  const known: Partial<AppKeyContext> = {
    getState: render.getState,
    setState: render.setState,
    help: mounted.help,
    activityFeed: mounted.activityFeed,
    confirm: mounted.confirm,
    syncPreview: mounted.syncPreview,
    reviewPreview: mounted.reviewPreview,
    filePicker: mounted.filePicker,
    commentsPicker: mounted.commentsPicker,
    occurrencePicker: mounted.occurrencePicker,
    marksPicker: mounted.marksPicker,
    commitPicker: mounted.commitPicker,
    actionMenu: mounted.actionMenu,
    linePeek: mounted.linePeek,
    blamePeek: mounted.blamePeek,
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

const pendingReview: PendingReview = {
  id: 7,
  user: "octo",
  body: "",
  comments: [
    { id: 1, body: "Draft one", path: "src/greet.ts", line: 2, side: "RIGHT" },
    { id: 2, body: "Draft two", path: "src/greet.ts", line: 3, side: "RIGHT" },
  ],
}

test("Submit Review warns of GitHub's pending review, and a reload drops it", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  app.pendingReview.set(pendingReview)
  keysOn(app)
  const { mockInput } = app.setup

  await mockInput.typeText("gS")
  let screen = await app.frame()
  expect(screen).toContain("! Pending review on GitHub (2 comments)")
  expect(screen).toContain("Will be merged with your new comments on submit")

  adoptReloadedState(reloadCtx(app), (s) => s)
  app.render()
  expect(await app.frame()).not.toContain("Submit Review")

  await mockInput.typeText("gS")
  screen = await app.frame()
  expect(screen).toContain("Submit Review")
  expect(screen).not.toContain("Pending review on GitHub")
  expect(screen).not.toContain("Will be merged")
})

test("a submit forgets GitHub's pending review: Submit Review opens again without its banner or its comments", async () => {
  app = await mountApp(DIFF, { width: 100, height: 30 })
  const pr = prInfo("")
  app.ctx.setState((s) => withPendingComments({ ...s, appMode: "pr", prInfo: pr }, pendingReview))
  app.pendingReview.set(pendingReview)
  app.render()
  const sent: (number | undefined)[] = []
  const reviewCalls: ReviewCalls = {
    getPrHeadSha: async () => "head",
    submitReview: async (_owner, _repo, _number, _comments, _sha, _event, _body, pendingReviewId) => {
      sent.push(pendingReviewId)
      return { success: true }
    },
    getCurrentUser: async () => "octo",
    getPrComments: async () => [],
    saveComment: async () => {},
  }
  keysOn(app, { prInfo: pr, reviewCalls })
  const { mockInput } = app.setup

  await mockInput.typeText("gS")
  let screen = await app.frame()
  expect(screen).toContain("Pending review on GitHub")
  expect(screen).toContain("Draft one")
  mockInput.pressEnter()
  for (let i = 0; i < 50 && app.reviewPreview.open(); i++) await Bun.sleep(10)
  expect(sent).toEqual([7])
  expect(app.reviewPreview.open()).toBe(false)

  await mockInput.typeText("gS")
  screen = await app.frame()
  expect(screen).toContain("Submit Review")
  expect(screen).not.toContain("Pending review on GitHub")
  expect(screen).not.toContain("Will be merged")
  expect(screen).not.toContain("Draft one")
})
