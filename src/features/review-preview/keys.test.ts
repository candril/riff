import { test, expect, describe } from "bun:test"
import { parseKeypress } from "@opentui/core"
import { createInitialState, openReviewPreview, type AppState } from "../../state"
import type { Comment } from "../../types"
import type { ValidatedComment } from "../../components/review-preview-model"
import { keymapHarness } from "../../testing/keymap-keys"
import { registerReviewPreviewKeys } from "./keys"

const SEQUENCES: Record<string, string> = {
  return: "\r",
  escape: "\x1b",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  space: " ",
  "ctrl+s": "\x13",
  // Kitty's CSI u: the legacy encodings of these collide with other keys.
  "shift+return": "\x1b[13;2u",
  "ctrl+return": "\x1b[13;5u",
  "meta+return": "\x1b[13;3u",
  "super+return": "\x1b[13;9u",
  "hyper+return": "\x1b[13;17u",
  "shift+escape": "\x1b[27;2u",
  "ctrl+tab": "\x1b[9;5u",
}

const comment = (id: string): ValidatedComment => ({ comment: { id } as Comment, valid: true })

interface Setup {
  reviewPreview?: Partial<AppState["reviewPreview"]>
  comments?: ValidatedComment[]
  summary?: string
  isOwnPr?: boolean
  open?: boolean
}

async function harness(setup: Setup = {}) {
  const base = createInitialState([], [], "local", "local changes")
  const opened = setup.open === false ? base : openReviewPreview(base)
  let state: AppState = { ...opened, reviewPreview: { ...opened.reviewPreview, ...setup.reviewPreview } }
  const confirms: string[] = []
  const { riffKeymap, legacyKeys, press: pressSequence } = await keymapHarness()
  registerReviewPreviewKeys(riffKeymap, {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    render: () => {},
    getValidatedComments: () => setup.comments ?? [comment("c1"), comment("c2"), { ...comment("c3"), valid: false }],
    isOwnPr: () => setup.isOwnPr ?? false,
    onConfirmReview: () => {
      confirms.push(state.reviewPreview.body)
    },
    readSummary: () => setup.summary ?? "",
  })
  /** Whether Submit Review kept the key from the chain, and whether it prevented it. */
  const press = (name: string, rename?: string) => {
    const before = legacyKeys.length
    const key = pressSequence(SEQUENCES[name] ?? name, rename)
    return { kept: legacyKeys.length === before, prevented: key.defaultPrevented }
  }
  return { press, confirms, state: () => state }
}

const inInput = { focusedSection: "input" } as const

describe("Submit Review's keys", () => {
  test("do nothing while it is closed", async () => {
    const h = await harness({ open: false })
    expect(h.press("return")).toEqual({ kept: false, prevented: false })
    expect(h.confirms).toEqual([])
  })

  test("Enter submits what the summary holds, from either section", async () => {
    const h = await harness({ summary: "Ship it" })
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.confirms).toEqual(["Ship it"])

    const typing = await harness({ summary: "Ship it", reviewPreview: inInput })
    expect(typing.press("shift+return")).toEqual({ kept: true, prevented: true })
    expect(typing.confirms).toEqual(["Ship it"])
  })

  test("Enter submits with super or hyper held", async () => {
    expect(parseKeypress(SEQUENCES["super+return"]!, { useKittyKeyboard: true })).toMatchObject({ name: "return", super: true })
    expect(parseKeypress(SEQUENCES["hyper+return"]!, { useKittyKeyboard: true })).toMatchObject({ name: "return", hyper: true })
    const h = await harness({ summary: "Ship it", reviewPreview: inInput })
    expect(h.press("super+return")).toEqual({ kept: true, prevented: true })
    expect(h.press("hyper+return")).toEqual({ kept: true, prevented: true })
    expect(h.confirms).toEqual(["Ship it", "Ship it"])
  })

  test("Ctrl-s submits too", async () => {
    const h = await harness({ reviewPreview: inInput })
    expect(h.press("ctrl+s")).toEqual({ kept: true, prevented: true })
    expect(h.confirms).toEqual([""])
  })

  test("Ctrl-Enter, Meta-Enter and a key named enter do not submit, and reach the summary", async () => {
    const h = await harness({ reviewPreview: inInput })
    expect(h.press("ctrl+return")).toEqual({ kept: true, prevented: false })
    expect(h.press("meta+return")).toEqual({ kept: true, prevented: false })
    expect(h.press("return", "enter")).toEqual({ kept: true, prevented: false })
    expect(h.confirms).toEqual([])
  })

  test("Enter while a review is being submitted does nothing, and still takes the key", async () => {
    const h = await harness({ reviewPreview: { loading: true } })
    expect(h.press("return")).toEqual({ kept: true, prevented: true })
    expect(h.confirms).toEqual([])
  })

  test("Enter that cannot submit still puts the summary in state", async () => {
    const h = await harness({ comments: [], summary: "  ", reviewPreview: inInput })
    h.press("return")
    expect(h.confirms).toEqual([])
    expect(h.state().reviewPreview.body).toBe("  ")
  })

  test("approving one's own PR does not submit", async () => {
    const h = await harness({ isOwnPr: true, reviewPreview: { selectedEvent: "APPROVE" } })
    h.press("return")
    expect(h.confirms).toEqual([])
  })

  test("Esc closes it, whatever is held", async () => {
    const h = await harness({ reviewPreview: inInput })
    expect(h.press("shift+escape")).toEqual({ kept: true, prevented: true })
    expect(h.state().reviewPreview.open).toBe(false)
  })

  test("Tab switches between the comments and the summary, whatever is held", async () => {
    const h = await harness()
    expect(h.press("tab")).toEqual({ kept: true, prevented: true })
    expect(h.state().reviewPreview.focusedSection).toBe("input")
    h.press("ctrl+tab")
    expect(h.state().reviewPreview.focusedSection).toBe("comments")
  })

  test("in the comments, 1, 2 and 3 pick the review type", async () => {
    const h = await harness()
    expect(h.press("2")).toEqual({ kept: true, prevented: true })
    expect(h.state().reviewPreview.selectedEvent).toBe("APPROVE")
    h.press("3")
    expect(h.state().reviewPreview.selectedEvent).toBe("REQUEST_CHANGES")
    h.press("1")
    expect(h.state().reviewPreview.selectedEvent).toBe("COMMENT")
  })

  test("in the comments, j, k and the arrows move over the valid comments, and space leaves one out", async () => {
    const h = await harness()
    h.press("j")
    h.press("down")
    expect(h.state().reviewPreview.highlightedIndex).toBe(1)
    h.press("k")
    h.press("up")
    expect(h.state().reviewPreview.highlightedIndex).toBe(0)
    expect(h.press("space")).toEqual({ kept: true, prevented: true })
    expect([...h.state().reviewPreview.excludedCommentIds]).toEqual(["c1"])
  })

  test("in the comments, every other key is kept from the chain and left unprevented", async () => {
    const h = await harness()
    for (const name of ["x", "q", "4"]) expect(h.press(name)).toEqual({ kept: true, prevented: false })
    expect(h.state().reviewPreview.open).toBe(true)
  })

  test("in the summary, the comments' keys are letters, kept from the chain and left for the textarea", async () => {
    const h = await harness({ reviewPreview: inInput })
    for (const name of ["j", "k", "2", "space", "x", "down"]) {
      expect(h.press(name)).toEqual({ kept: true, prevented: false })
    }
    expect(h.state().reviewPreview).toMatchObject({ highlightedIndex: 0, selectedEvent: "COMMENT" })
    expect(h.state().reviewPreview.excludedCommentIds.size).toBe(0)
  })
})
