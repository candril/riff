import { test, expect, describe } from "bun:test"
import {
  createInitialState,
  openInlineCommentOverlay,
  expandThreadFor,
  getInlineCommentOverlayDisplayOrder,
  toggleInlineCommentOverlayExpand,
  type AppState,
} from "./state"
import type { Comment } from "./types"

function comment(id: string, resolved: boolean, inReplyTo?: string): Comment {
  return {
    id,
    filename: "src/app.ts",
    line: 42,
    side: "RIGHT",
    body: id,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    inReplyTo,
    isThreadResolved: resolved,
  }
}

function panelOn(comments: Comment[]): AppState {
  const state = { ...createInitialState([], [], "local", "local changes"), comments }
  return openInlineCommentOverlay(state, "src/app.ts", 42, "RIGHT", "view")
}

const resolved = [comment("a1", true), comment("a2", true, "a1")]
const open = [comment("b1", false), comment("b2", false, "b1")]

describe("arriving at a thread that is folded shut", () => {
  test("a resolved thread opens, replies and all", () => {
    const state = expandThreadFor(panelOn(resolved), "a2")

    expect(getInlineCommentOverlayDisplayOrder(state).map((c) => c.id)).toEqual(["a1", "a2"])
  })

  test("one that is already open is left alone — the set flips the default", () => {
    const state = expandThreadFor(panelOn(open), "b2")

    expect(getInlineCommentOverlayDisplayOrder(state).map((c) => c.id)).toEqual(["b1", "b2"])
  })

  test("one the reader folded by hand is opened again, having been asked for", () => {
    const folded = toggleInlineCommentOverlayExpand(panelOn(open), "b1")
    expect(getInlineCommentOverlayDisplayOrder(folded).map((c) => c.id)).toEqual(["b1"])

    expect(
      getInlineCommentOverlayDisplayOrder(expandThreadFor(folded, "b2")).map((c) => c.id)
    ).toEqual(["b1", "b2"])
  })

  test("a comment the panel does not hold changes nothing", () => {
    const state = panelOn(resolved)

    expect(expandThreadFor(state, "nope")).toBe(state)
  })
})
