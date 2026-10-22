import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable, TextareaRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createReviewPreviewIsland } from "./review-preview"
import { reviewPreviewModel, type ValidatedComment } from "../components/review-preview-model"
import { fgAt, findText, ints, paintOf } from "../testing/frame"
import { theme } from "../theme"
import type { ReviewPreviewSnapshot } from "../features/review-preview/state"
import type { PendingReview } from "../providers/github/types"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

const changes: string[] = []

afterEach(() => {
  changes.length = 0
})

/** An island whose summary changes land in `changes`. */
function islandOn(renderer: TestRendererSetup["renderer"]) {
  return createReviewPreviewIsland(renderer, { onSummaryChange: (value) => changes.push(value) })
}

function summaryOf(island: ReturnType<typeof islandOn>) {
  const textarea = island.host.findDescendantById("review-summary-composer")
  expect(textarea).toBeInstanceOf(TextareaRenderable)
  return textarea as TextareaRenderable
}

/** The textarea reports a change a microtask after it happens. */
const settled = () => Bun.sleep(10)

async function rows() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame().split("\n")
}

/** A full-screen parent, as the shell's root is, for the absolute host to sit in. */
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

function model(overrides: Partial<ReviewPreviewSnapshot> = {}) {
  return reviewPreviewModel(COMMENTS, { ...baseState(), ...overrides }, null, false)
}

const screenText = (screen: string[]) => screen.join("\n")

function commentsOf(count: number, extra: Partial<ValidatedComment["comment"]> = {}): ValidatedComment[] {
  return Array.from({ length: count }, (_, i) => ({
    comment: { ...COMMENTS[0]!.comment, id: `k${i}`, line: i + 1, body: `Note ${i}`, ...extra },
    valid: true,
  }))
}

const pending = (count: number): PendingReview => ({
  id: 1,
  user: "octo",
  body: "",
  comments: Array.from({ length: count }, (_, i) => ({ id: i, body: "x", path: "a.ts", line: i, side: "RIGHT" as const })),
})

/** The states the frame tests draw, plus a few between them; null closes the modal. */
const CYCLE: (ReturnType<typeof reviewPreviewModel> | null)[] = [
  model({ excludedCommentIds: new Set(["c1", "c2"]) }),
  model({ focusedSection: "input" }),
  reviewPreviewModel([], baseState(), pending(1), false),
  null,
  reviewPreviewModel(
    commentsOf(3).map((c, i) => (i === 1 ? { ...c, comment: { ...c.comment, status: "pending" } } : c)),
    { ...baseState(), selectedEvent: "APPROVE", excludedCommentIds: new Set(["k2"]), highlightedIndex: 1 },
    pending(2),
    true
  ),
  reviewPreviewModel(commentsOf(1), { ...baseState(), selectedEvent: "REQUEST_CHANGES" }, null, true),
  model({ loading: true }),
  null,
  model({ error: "Boom" }),
  reviewPreviewModel([...commentsOf(8), { ...commentsOf(1)[0]!, valid: false }], baseState(), null, false),
  model({ highlightedIndex: 1 }),
  reviewPreviewModel([], baseState(), null, false),
  null,
  model(),
]

function baseState(): ReviewPreviewSnapshot {
  return {
    selectedEvent: "COMMENT",
    loading: false,
    error: undefined,
    body: "",
    excludedCommentIds: new Set(),
    highlightedIndex: 0,
    focusedSection: "comments",
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
  const island = islandOn(screen.renderer)
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
  const island = islandOn(setup.renderer)
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
  const island = islandOn(setup.renderer)
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
  const island = islandOn(setup.renderer)
  const summary = summaryOf(island)
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
  expect(summaryOf(island)).toBe(summary)
  expect(summary.isDestroyed).toBe(false)
  island.dispose()
})

test("removed from a parent box that is then destroyed, the host keeps the modal for the next pass", async () => {
  setup = await createTestRenderer({ width: 100, height: 40 })
  const island = islandOn(setup.renderer)
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
  const island = islandOn(setup.renderer)
  const summary = summaryOf(island)
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
  const island = islandOn(setup.renderer)
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

describe("the summary", () => {
  test("each island types into a textarea of its own, on its own renderer", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const other = await createTestRenderer({ width: 100, height: 40 })
    const first = islandOn(setup.renderer)
    const second = islandOn(other.renderer)
    mount(first.host)
    other.renderer.root.add(second.host)

    first.update(model({ focusedSection: "input", body: "One" }))
    second.update(model({ focusedSection: "input", body: "Two" }))
    expect(summaryOf(first)).not.toBe(summaryOf(second))
    summaryOf(first).insertText("1 ")
    summaryOf(second).insertText("2 ")
    expect(first.summaryValue()).toBe("1 One")
    expect(second.summaryValue()).toBe("2 Two")

    first.dispose()
    second.dispose()
    other.renderer.destroy()
  })

  test("opening seeds it from the body, without reporting the seed as typing", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    mount(island.host)

    island.update(model({ body: "Draft" }))
    await settled()
    expect(summaryOf(island).plainText).toBe("Draft")
    expect(island.summaryValue()).toBe("Draft")
    expect(changes).toEqual([])
    expect(screenText(await rows())).toContain("Draft")
    island.dispose()
  })

  test("what is typed survives passes that carry another body", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    mount(island.host)

    island.update(model({ focusedSection: "input", body: "" }))
    summaryOf(island).insertText("Typed")
    island.update(model({ focusedSection: "input", body: "Stale" }))
    island.update(model({ focusedSection: "comments", body: "" }))
    expect(island.summaryValue()).toBe("Typed")
    island.dispose()
  })

  test("closing and reopening seeds it afresh", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    mount(island.host)

    island.update(model({ focusedSection: "input" }))
    summaryOf(island).insertText("Abandoned")
    island.update(null)
    island.update(model({ body: "Fresh" }))
    expect(island.summaryValue()).toBe("Fresh")
    island.dispose()
  })

  test("takes focus while its section is focused, and gives it up on close", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    const summary = summaryOf(island)
    mount(island.host)

    island.update(model())
    expect(summary.focused).toBe(false)
    island.update(model({ focusedSection: "input" }))
    expect(summary.focused).toBe(true)
    island.update(model({ focusedSection: "comments" }))
    expect(summary.focused).toBe(false)
    island.update(model({ focusedSection: "input" }))
    island.update(null)
    expect(summary.focused).toBe(false)
    island.dispose()
  })

  test("reports what is typed into it, key by key", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    mount(island.host)

    island.update(model({ focusedSection: "input", body: "!" }))
    await setup.mockInput.typeText("ok")
    await settled()
    expect(changes.at(-1)).toBe("ok!")
    expect(changes).not.toContain("!")
    island.dispose()
  })

  test("reads the live text while open, and nothing once closed", async () => {
    setup = await createTestRenderer({ width: 100, height: 40 })
    const island = islandOn(setup.renderer)
    mount(island.host)

    expect(island.summaryValue()).toBe("")
    island.update(model({ focusedSection: "input" }))
    summaryOf(island).insertText("Live")
    expect(island.summaryValue()).toBe("Live")
    await settled()
    island.update(null)
    expect(island.summaryValue()).toBe("")
    await settled()
    summaryOf(island).insertText("closed ")
    await settled()
    expect(changes).toEqual(["Live"])
    island.dispose()
  })
})
