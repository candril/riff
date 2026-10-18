import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createReviewPreviewIsland } from "./review-preview"
import { reviewPreviewModel, type ValidatedComment } from "../components/review-preview-model"
import { getReviewSummaryRenderable } from "../components/ReviewSummaryComposer"
import { fgAt, findText, ints, paintOf } from "../testing/frame"
import { theme } from "../theme"
import type { ReviewPreviewState } from "../state"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function rows() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame().split("\n")
}

/** A full-screen parent, as render.ts's root box is, for the absolute host to sit in. */
function mount(host: BoxRenderable) {
  const parent = new BoxRenderable(setup!.renderer, { width: "100%", height: "100%" })
  setup!.renderer.root.add(parent)
  parent.add(host)
  return parent
}

const COMMENTS: ValidatedComment[] = ["c1", "c2"].map((id, i) => ({
  comment: {
    id,
    filename: "src/greet.ts",
    line: i + 3,
    side: "RIGHT",
    body: `Body ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "local",
  },
  valid: true,
}))

function model(overrides: Partial<ReviewPreviewState> = {}) {
  const state: ReviewPreviewState = {
    open: true,
    selectedEvent: "COMMENT",
    loading: false,
    body: "",
    excludedCommentIds: new Set(),
    highlightedIndex: 0,
    focusedSection: "comments",
    pendingReview: null,
    pendingReviewLoading: false,
    ...overrides,
  }
  return reviewPreviewModel(COMMENTS, state, false)
}

const screenText = (screen: string[]) => screen.join("\n")

function commentsOf(count: number, extra: Partial<ValidatedComment["comment"]> = {}): ValidatedComment[] {
  return Array.from({ length: count }, (_, i) => ({
    comment: { ...COMMENTS[0]!.comment, id: `k${i}`, line: i + 1, body: `Note ${i}`, ...extra },
    valid: true,
  }))
}

const pending = (count: number): ReviewPreviewState["pendingReview"] => ({
  id: 1,
  user: "octo",
  body: "",
  comments: Array.from({ length: count }, (_, i) => ({ id: i, body: "x", path: "a.ts", line: i, side: "RIGHT" as const })),
})

/** The states the frame tests draw, plus a few between them; null closes the modal. */
const CYCLE: (ReturnType<typeof reviewPreviewModel> | null)[] = [
  model({ excludedCommentIds: new Set(["c1", "c2"]) }),
  model({ focusedSection: "input" }),
  reviewPreviewModel([], { ...baseState(), pendingReview: pending(1) }, false),
  null,
  reviewPreviewModel(
    commentsOf(3).map((c, i) => (i === 1 ? { ...c, comment: { ...c.comment, status: "pending" } } : c)),
    { ...baseState(), selectedEvent: "APPROVE", excludedCommentIds: new Set(["k2"]), highlightedIndex: 1, pendingReview: pending(2) },
    true
  ),
  reviewPreviewModel(commentsOf(1), { ...baseState(), selectedEvent: "REQUEST_CHANGES", pendingReviewLoading: true }, true),
  model({ loading: true }),
  null,
  model({ error: "Boom" }),
  reviewPreviewModel([...commentsOf(8), { ...commentsOf(1)[0]!, valid: false }], baseState(), false),
  model({ highlightedIndex: 1 }),
  reviewPreviewModel([], baseState(), false),
  null,
  model(),
]

function baseState(): ReviewPreviewState {
  return {
    open: true,
    selectedEvent: "COMMENT",
    loading: false,
    body: "",
    excludedCommentIds: new Set(),
    highlightedIndex: 0,
    focusedSection: "comments",
    pendingReview: null,
    pendingReviewLoading: false,
  }
}

async function painted(screen: TestRendererSetup) {
  await screen.renderOnce()
  await screen.renderOnce()
  return { chars: screen.captureCharFrame(), paint: paintOf(screen.captureSpans()) }
}

/** What a fresh island draws for `next`, on a screen of its own. */
async function freshPaint(next: ReturnType<typeof reviewPreviewModel> | null) {
  const screen = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(screen.renderer)
  const parent = new BoxRenderable(screen.renderer, { width: "100%", height: "100%" })
  screen.renderer.root.add(parent)
  parent.add(island.host)
  island.update(next)
  const result = await painted(screen)
  island.dispose()
  screen.renderer.destroy()
  return result
}

test("draws nothing until it has a model, then the modal", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  mount(island.host)

  island.update(null)
  expect(screenText(await rows()).trim()).toBe("")

  island.update(model())
  const screen = screenText(await rows())
  expect(screen).toContain("Submit Review")
  expect(screen).toContain("Comments (2/2) - j/k, space")
  expect(screen).toContain("✓ greet.ts:4 Body c2")
  island.dispose()
})

test("a second update changes only what changed", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  mount(island.host)

  island.update(model())
  let screen = await rows()
  const title = findText(island.host, "Submit Review")
  const first = findText(island.host, "greet.ts:3 ")
  const checkbox = screen.findIndex((line) => line.includes("greet.ts:4"))
  expect(screen[checkbox]).toContain("✓ greet.ts:4")

  island.update(model({ excludedCommentIds: new Set(["c2"]) }))
  screen = await rows()
  expect(screen[checkbox]).toContain("○ greet.ts:4")
  expect(fgAt(setup.captureSpans(), screen[checkbox]!.indexOf("○"), checkbox)).toEqual(ints(theme.overlay0))
  expect(screenText(screen)).toContain("Comments (1/2)")
  expect(findText(island.host, "Submit Review")).toBe(title!)
  expect(findText(island.host, "greet.ts:3 ")).toBe(first!)
  island.dispose()
})

test("closing and reopening keeps the same summary textarea, undestroyed", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  const summary = getReviewSummaryRenderable(setup.renderer)
  mount(island.host)

  island.update(model())
  await rows()
  const parent = summary.parent
  expect(parent).not.toBeNull()

  island.update(null)
  expect(screenText(await rows()).trim()).toBe("")
  // Solid destroys what it removes on the next tick.
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(summary.isDestroyed).toBe(false)
  expect(summary.parent).toBe(parent)

  island.update(model({ focusedSection: "input" }))
  const screen = screenText(await rows())
  expect(screen).toContain("Summary (editing)")
  expect(screen).toContain("Summary (optional)")
  expect(getReviewSummaryRenderable(setup.renderer)).toBe(summary)
  expect(summary.isDestroyed).toBe(false)
  island.dispose()
})

test("unmounted the way render.ts's discard does it, the host keeps the modal for the next pass", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  const first = mount(island.host)

  island.update(model())
  await rows()
  first.remove(island.host)
  first.destroyRecursively()
  island.update(null)
  await new Promise((resolve) => setTimeout(resolve, 10))

  mount(island.host)
  island.update(model())
  expect(screenText(await rows())).toContain("Submit Review")
  island.dispose()
})

test("dispose tears the island down, textarea and all", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  const summary = getReviewSummaryRenderable(setup.renderer)
  mount(island.host)
  island.update(model())
  await rows()

  island.dispose()
  expect(island.host.isDestroyed).toBe(true)
  expect(summary.isDestroyed).toBe(true)
  expect(screenText(await rows()).trim()).toBe("")
})

test("one island cycled through every state, closed between some, draws what a fresh island draws", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = createReviewPreviewIsland(setup.renderer)
  mount(island.host)

  for (const [step, next] of CYCLE.entries()) {
    island.update(next)
    const cycled = await painted(setup)
    expect(cycled.chars.includes("Submit Review")).toBe(next !== null)
    const fresh = await freshPaint(next)
    expect({ step, chars: cycled.chars }).toEqual({ step, chars: fresh.chars })
    expect({ step, paint: cycled.paint }).toEqual({ step, paint: fresh.paint })
  }
  island.dispose()
})
