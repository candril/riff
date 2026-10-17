import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import { ReviewPreview, type ValidatedComment } from "./ReviewPreview"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import type { ReviewPreviewState } from "../state"
import type { Comment } from "../types"

const BOX_DRAWING = /[─-╿]/

function comment(id: string, line: number, body: string): ValidatedComment {
  const c: Comment = {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body,
    createdAt: "2026-01-10T10:00:00Z",
    status: "local",
  }
  return { comment: c, valid: true }
}

function reviewState(overrides: Partial<ReviewPreviewState> = {}): ReviewPreviewState {
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
    ...overrides,
  }
}

const COMMENTS = [comment("c1", 3, "Rename this"), comment("c2", 10, "Looks off by one")]

// Both comments left out and no summary: the submit button is drawn disabled.
const STATE = reviewState({ excludedCommentIds: new Set(["c1", "c2"]) })

let mounted: Awaited<ReturnType<typeof mountRenderable>>
let lines: string[]
let spans: ReturnType<typeof mounted.setup.captureSpans>

const rowOf = (needle: string) => lines.findIndex((line) => line.includes(needle))
const modalLeft = () => lines[rowOf("Submit Review")]!.indexOf("Submit Review") - 2

beforeAll(async () => {
  mounted = await mountRenderable(
    (renderer) => ReviewPreview({ comments: COMMENTS, state: STATE, renderer }),
    { width: 100, height: 40 }
  )
  lines = (await mounted.frame()).split("\n")
  spans = mounted.setup.captureSpans()
})

afterAll(async () => {
  await mounted.dispose()
})

describe("the Submit Review modal", () => {
  test("draws no frame", () => {
    expect(lines.join("\n")).not.toMatch(BOX_DRAWING)
  })

  test("sits on mantle, from the type selector down to the footer", () => {
    for (const needle of ["1: Comment", "Summary", "Add a comment or summary"]) {
      const y = rowOf(needle)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(bgAt(spans, modalLeft(), y)).toEqual(ints(theme.mantle))
    }
  })

  test("types the summary on surface0, flush under its label", () => {
    const labelRow = lines.findIndex((line) => line.trim() === "Summary")
    const column = lines[labelRow]!.indexOf("Summary")
    const textareaRow = labelRow + 2
    expect(bgAt(spans, column, textareaRow)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, column + 20, textareaRow + 2)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, column - 1, textareaRow)).toEqual(ints(theme.mantle))
  })

  test("marks the highlighted comment with surface0", () => {
    const y = rowOf("greet.ts:3")
    expect(bgAt(spans, lines[y]!.indexOf("greet.ts:3"), y)).toEqual(ints(theme.surface0))
  })

  test("uses no fourth shade", () => {
    const top = rowOf("Submit Review")
    const bottom = rowOf("Add a comment or summary")
    const left = modalLeft()
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x < left + 72; x++) {
        expect(bgAt(spans, x, y)).not.toEqual(ints(theme.surface1))
      }
    }
  })
})
