import { test, expect, describe, beforeAll, afterAll } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { reviewPreviewModel, type ValidatedComment } from "./review-preview-model"
import { createReviewPreviewIsland } from "../app/review-preview"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import type { ReviewPreviewState } from "../state"
import type { Comment } from "../types"

/*
 * The modal on a 100x40 screen: 72 wide in the middle, so its left edge is
 * column 14 and its padded text starts at column 16.
 */

const BOX_DRAWING = /[─-╿]/
const LEFT = 14
const TEXT = 16

function comment(id: string, line: number, body: string, extra: Partial<Comment> = {}): ValidatedComment {
  const c: Comment = {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body,
    createdAt: "2026-01-10T10:00:00Z",
    status: "local",
    ...extra,
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

function pendingReview(count: number): ReviewPreviewState["pendingReview"] {
  return {
    id: 1,
    user: "octo",
    body: "",
    comments: Array.from({ length: count }, (_, i) => ({ id: i, body: "x", path: "a.ts", line: i, side: "RIGHT" as const })),
  }
}

/** A frame row from (column, text) pairs, trimmed as the captured frame is. */
function at(...cells: [number, string][]): string {
  let line = ""
  for (const [column, text] of cells) line = line.padEnd(column) + text
  return line
}

const HEADER = at([TEXT, "Submit Review"], [72, "Esc to close"])
const CHIPS = at([TEXT + 1, "1: Comment"], [32, "2: Approve"], [47, "3: Request Changes"])
const PLACEHOLDER = [
  at([TEXT, "Summary (optional) — Enter to submit, Ctrl-J for a newline, Esc to"]),
  at([TEXT, "cancel"]),
]
const footer = (status: string) => at([TEXT, status], [77, "Enter"])
const blank = (n: number): string[] => Array(n).fill("")

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
let dispose = () => {}
let lines: string[]
let spans: ReturnType<TestRendererSetup["captureSpans"]>

afterAll(async () => {
  dispose()
  await mounted?.dispose()
})

/** Each state on a screen of its own, as the island draws it when render.ts first opens it. */
async function show(comments: ValidatedComment[], state: ReviewPreviewState, isOwnPr = false) {
  dispose()
  await mounted?.dispose()
  mounted = await mountRenderable(
    (renderer) => {
      const island = createReviewPreviewIsland(renderer)
      dispose = island.dispose
      island.update(reviewPreviewModel(comments, state, isOwnPr))
      return island.host
    },
    { width: 100, height: 40 }
  )
  lines = (await mounted.frame()).split("\n")
  spans = mounted.setup.captureSpans()
}

const rowOf = (needle: string) => lines.findIndex((line) => line.includes(needle))
const columnOf = (needle: string) => lines[rowOf(needle)]!.indexOf(needle)
const fg = (needle: string) => fgAt(spans, columnOf(needle), rowOf(needle))
const bg = (needle: string) => bgAt(spans, columnOf(needle), rowOf(needle))

describe("the Submit Review modal", () => {
  // Both comments left out and no summary: the submit button is drawn disabled.
  beforeAll(() =>
    show(
      [comment("c1", 3, "Rename this"), comment("c2", 10, "Looks off by one")],
      reviewState({ excludedCommentIds: new Set(["c1", "c2"]) })
    )
  )

  test("draws no frame", () => {
    expect(lines.join("\n")).not.toMatch(BOX_DRAWING)
  })

  test("sits on mantle, from the type selector down to the footer", () => {
    for (const needle of ["1: Comment", "Summary", "Add a comment or summary"]) {
      const y = rowOf(needle)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(bgAt(spans, LEFT, y)).toEqual(ints(theme.mantle))
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
    expect(bg("greet.ts:3")).toEqual(ints(theme.surface0))
    expect(bg("greet.ts:10")).toEqual(ints(theme.mantle))
  })

  test("leaves out comments as ○ in overlay0", () => {
    const y = rowOf("greet.ts:3")
    expect(lines[y]).toBe(at([TEXT + 1, "○ greet.ts:3 Rename this"]))
    expect(fgAt(spans, TEXT + 1, y)).toEqual(ints(theme.overlay0))
  })

  test("uses no fourth shade", () => {
    const top = rowOf("Submit Review")
    const bottom = rowOf("Add a comment or summary")
    for (let y = top; y <= bottom; y++) {
      for (let x = LEFT; x < LEFT + 72; x++) {
        expect(bgAt(spans, x, y)).not.toEqual(ints(theme.surface1))
      }
    }
  })

  test("greys the Enter button out while there is nothing to submit", () => {
    const y = rowOf("Add a comment or summary")
    expect(fgAt(spans, TEXT, y)).toEqual(ints(theme.yellow))
    expect(bgAt(spans, 75, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 83, y)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 74, y)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, 77, y)).toEqual(ints(theme.overlay0))
  })
})

describe("with the summary focused", () => {
  beforeAll(() =>
    show(
      [comment("c1", 3, "Rename this"), comment("c2", 10, "x".repeat(41)), { ...comment("bad", 1, "Gone"), valid: false }],
      reviewState({ focusedSection: "input" })
    )
  )

  test("labels the summary as editing and the comments without their keys, and cuts a long body at 40", () => {
    expect(lines).toEqual([
      ...blank(10),
      HEADER,
      "",
      "",
      CHIPS,
      "",
      "",
      at([TEXT, "Summary (editing)"]),
      "",
      ...PLACEHOLDER,
      "",
      "",
      "",
      at([TEXT, "Comments (2/2)"]),
      "",
      at([TEXT + 1, "✓ greet.ts:3 Rename this"]),
      at([TEXT + 1, "✓ greet.ts:10 " + "x".repeat(40) + "…"]),
      "",
      "",
      footer("Tab: switch · Enter: submit"),
    ])
  })

  test("colours the header, the labels and the comment rows", () => {
    expect(fg("Submit Review")).toEqual(ints(theme.text))
    expect(fg("Esc to close")).toEqual(ints(theme.overlay0))
    expect(fg("Summary (editing)")).toEqual(ints(theme.text))
    expect(fg("Comments (2/2)")).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, TEXT + 1, rowOf("greet.ts:3"))).toEqual(ints(theme.green))
    expect(fg("greet.ts:3")).toEqual(ints(theme.blue))
    expect(fg("Rename this")).toEqual(ints(theme.subtext0))
    // The comments list has no focus, so no row is highlighted.
    expect(bg("greet.ts:3")).toEqual(ints(theme.mantle))
  })

  test("puts the selected Comment chip on blue with base text, the others in subtext0 on mantle", () => {
    expect(bgAt(spans, TEXT, rowOf("1: Comment"))).toEqual(ints(theme.blue))
    expect(bgAt(spans, TEXT + 11, rowOf("1: Comment"))).toEqual(ints(theme.blue))
    expect(bgAt(spans, TEXT + 12, rowOf("1: Comment"))).toEqual(ints(theme.mantle))
    expect(fg("1: Comment")).toEqual(ints(theme.base))
    expect(fg("2: Approve")).toEqual(ints(theme.subtext0))
    expect(bg("2: Approve")).toEqual(ints(theme.mantle))
    expect(fg("3: Request Changes")).toEqual(ints(theme.subtext0))
  })

  test("shows the submit keys in overlay0 beside a live Enter button on the event colour", () => {
    expect(fg("Tab: switch")).toEqual(ints(theme.overlay0))
    const y = rowOf("Tab: switch")
    expect(bgAt(spans, 75, y)).toEqual(ints(theme.blue))
    expect(bgAt(spans, 83, y)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 77, y)).toEqual(ints(theme.base))
  })
})

describe("with a pending review of one comment and nothing to submit", () => {
  beforeAll(() => show([], reviewState({ pendingReview: pendingReview(1) })))

  test("shows the banner in the singular and no comments section", () => {
    expect(lines).toEqual([
      ...blank(11),
      HEADER,
      "",
      "",
      at([TEXT, "! Pending review on GitHub (1 comment)"]),
      at([TEXT, "  Will be merged with your new comments on submit"]),
      "",
      "",
      CHIPS,
      "",
      "",
      at([TEXT, "Summary"]),
      "",
      ...PLACEHOLDER,
      "",
      "",
      "",
      footer("Add a comment or summary"),
    ])
  })

  test("tints the banner with yellow at an alpha of 0x20", () => {
    const top = rowOf("! Pending review") - 1
    const tint = bgAt(spans, LEFT, top)
    // theme.yellow + "20" blended over mantle: a tint, not one of the three shades.
    expect(tint).toEqual([52, 49, 54, 255])
    for (let y = top; y <= top + 3; y++) {
      expect(bgAt(spans, LEFT, y)).toEqual(tint!)
      expect(bgAt(spans, LEFT + 71, y)).toEqual(tint!)
    }
    expect(bgAt(spans, LEFT, top - 1)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, LEFT, top + 4)).toEqual(ints(theme.mantle))
    expect(fg("! Pending review")).toEqual(ints(theme.yellow))
    expect(fg("Will be merged")).toEqual(ints(theme.subtext0))
    expect(fg("Summary")).toEqual(ints(theme.subtext0))
  })
})

describe("approving your own PR, with a pending review of two comments", () => {
  beforeAll(() =>
    show(
      [comment("c1", 3, "a"), comment("c2", 4, "b", { status: "pending" }), comment("c3", 5, "c")],
      reviewState({
        selectedEvent: "APPROVE",
        excludedCommentIds: new Set(["c3"]),
        highlightedIndex: 1,
        pendingReview: pendingReview(2),
      }),
      true
    )
  )

  test("shows the banner in the plural, the comments with their keys, and why it cannot submit", () => {
    expect(lines).toEqual([
      ...blank(8),
      HEADER,
      "",
      "",
      at([TEXT, "! Pending review on GitHub (2 comments)"]),
      at([TEXT, "  Will be merged with your new comments on submit"]),
      "",
      "",
      CHIPS,
      "",
      "",
      at([TEXT, "Summary"]),
      "",
      ...PLACEHOLDER,
      "",
      "",
      "",
      at([TEXT, "Comments (2/3) - j/k, space"]),
      "",
      at([TEXT + 1, "✓ greet.ts:3 a"]),
      at([TEXT + 1, "● greet.ts:4 b"]),
      at([TEXT + 1, "○ greet.ts:5 c"]),
      "",
      "",
      footer("Cannot approve your own PR"),
    ])
  })

  test("marks pending ● yellow, included ✓ green, excluded ○ overlay0", () => {
    expect(fgAt(spans, TEXT + 1, rowOf("greet.ts:3"))).toEqual(ints(theme.green))
    expect(fgAt(spans, TEXT + 1, rowOf("greet.ts:4"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, TEXT + 1, rowOf("greet.ts:5"))).toEqual(ints(theme.overlay0))
  })

  test("highlights the row under the cursor, and the focused section's label in text", () => {
    expect(bg("greet.ts:4")).toEqual(ints(theme.surface0))
    expect(bgAt(spans, TEXT, rowOf("greet.ts:4"))).toEqual(ints(theme.surface0))
    expect(bg("greet.ts:3")).toEqual(ints(theme.mantle))
    expect(fg("Comments (2/3)")).toEqual(ints(theme.text))
  })

  test("puts the Approve chip on green and greys the Enter button out", () => {
    expect(bgAt(spans, 31, rowOf("2: Approve"))).toEqual(ints(theme.green))
    expect(fg("2: Approve")).toEqual(ints(theme.base))
    expect(bgAt(spans, TEXT, rowOf("1: Comment"))).toEqual(ints(theme.mantle))
    expect(fg("1: Comment")).toEqual(ints(theme.subtext0))
    expect(fg("Cannot approve")).toEqual(ints(theme.yellow))
    expect(bgAt(spans, 75, rowOf("Cannot approve"))).toEqual(ints(theme.surface0))
  })
})

describe("requesting changes on your own PR while the pending review loads", () => {
  beforeAll(() =>
    show([comment("c1", 3, "a")], reviewState({ selectedEvent: "REQUEST_CHANGES", pendingReviewLoading: true }), true)
  )

  test("says it is checking for a pending review, and why it cannot submit", () => {
    expect(lines).toEqual([
      ...blank(9),
      HEADER,
      "",
      "",
      at([TEXT, "Checking for pending review..."]),
      "",
      "",
      CHIPS,
      "",
      "",
      at([TEXT, "Summary"]),
      "",
      ...PLACEHOLDER,
      "",
      "",
      "",
      at([TEXT, "Comments (1/1) - j/k, space"]),
      "",
      at([TEXT + 1, "✓ greet.ts:3 a"]),
      "",
      "",
      footer("Cannot request changes on your own PR"),
    ])
    expect(fg("Checking for pending review...")).toEqual(ints(theme.overlay0))
    expect(bg("Checking for pending review...")).toEqual(ints(theme.mantle))
  })

  test("puts the Request Changes chip on peach", () => {
    expect(bgAt(spans, 46, rowOf("3: Request Changes"))).toEqual(ints(theme.peach))
    expect(bgAt(spans, 65, rowOf("3: Request Changes"))).toEqual(ints(theme.peach))
    expect(fg("3: Request Changes")).toEqual(ints(theme.base))
    expect(fg("Cannot request changes")).toEqual(ints(theme.yellow))
  })
})

describe("while submitting", () => {
  beforeAll(() => show([comment("c1", 3, "a")], reviewState({ loading: true })))

  test("says Submitting... in yellow and greys the Enter button out", () => {
    const y = rowOf("Submitting...")
    expect(lines[y]).toBe(footer("Submitting..."))
    expect(fgAt(spans, TEXT, y)).toEqual(ints(theme.yellow))
    expect(bgAt(spans, 75, y)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, 77, y)).toEqual(ints(theme.overlay0))
  })
})

describe("after a failed submit", () => {
  beforeAll(() => show([comment("c1", 3, "a")], reviewState({ error: "Boom" })))

  test("shows the error in red beside a live Enter button", () => {
    const y = rowOf("Boom")
    expect(lines[y]).toBe(footer("Boom"))
    expect(fgAt(spans, TEXT, y)).toEqual(ints(theme.red))
    expect(bgAt(spans, 75, y)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 77, y)).toEqual(ints(theme.base))
  })
})

describe("with more than six comments", () => {
  beforeAll(() =>
    show(
      [
        ...Array.from({ length: 8 }, (_, i) => comment(`c${i}`, i, `b${i}`)),
        { ...comment("bad", 99, "Gone"), valid: false },
      ],
      reviewState()
    )
  )

  test("lists the first six valid ones and counts the rest", () => {
    expect(lines).toEqual([
      ...blank(8),
      HEADER,
      "",
      "",
      CHIPS,
      "",
      "",
      at([TEXT, "Summary"]),
      "",
      ...PLACEHOLDER,
      "",
      "",
      "",
      at([TEXT, "Comments (8/8) - j/k, space"]),
      "",
      ...Array.from({ length: 6 }, (_, i) => at([TEXT + 1, `✓ greet.ts:${i} b${i}`])),
      at([TEXT + 1, "+2 more"]),
      "",
      "",
      footer("Tab: switch · Enter: submit"),
    ])
    expect(fg("+2 more")).toEqual(ints(theme.overlay0))
  })
})
