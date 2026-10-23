import { describe, expect, test } from "bun:test"
import {
  closeInlineCommentOverlay,
  createInitialState,
  moveInlineCommentOverlayHighlight,
  openInlineCommentOverlay,
  setViewFilter,
  switchView,
  type AppState,
} from "../../state"
import type { Comment, ReactionTarget } from "../../types"
import { reactionTargetOf } from "./target"

function comment(id: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/a.ts",
    line,
    side: "RIGHT",
    body: `rename ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    ...fields,
  }
}

const COMMENTS = [comment("first", 1, { githubId: 11 }), comment("second", 2, { githubId: 22 })]
const OVERVIEW: ReactionTarget = { kind: "issue", prNumber: 7 }

function pr(fields: Partial<AppState> = {}): AppState {
  return { ...createInitialState([], [], "pr", "pr"), appMode: "pr", comments: COMMENTS, ...fields }
}

/** The thread panel open on src/a.ts, highlighted on the second comment. */
function onSecond(fields: Partial<AppState> = {}): AppState {
  return moveInlineCommentOverlayHighlight(openInlineCommentOverlay(pr(fields), "src/a.ts", 1, "RIGHT"), 1)
}

const targetOf = (state: AppState) => reactionTargetOf(state, () => OVERVIEW)

describe("reactionTargetOf", () => {
  test("follows the highlight after a thread-panel filter moves it", () => {
    const filtered = setViewFilter(onSecond(), "comments", "rename")

    expect(filtered.inlineCommentOverlay.highlightedIndex).toBe(0)
    expect(targetOf(filtered)).toEqual({ kind: "review-comment", githubId: 11 })
  })

  test("names nothing in the feed after a switch from the overview", () => {
    const overview = pr({ viewMode: "state" })
    expect(targetOf(overview)).toEqual(OVERVIEW)

    expect(targetOf(switchView(overview, "feed"))).toBeNull()
  })

  test("is the highlighted comment while the thread panel has focus, even over the overview", () => {
    const state = onSecond({ viewMode: "state" })

    expect(state.focusedPanel).toBe("comments")
    expect(targetOf(state)).toEqual({ kind: "review-comment", githubId: 22 })
  })

  test("is nothing when the highlighted comment is not on GitHub", () => {
    const local = moveInlineCommentOverlayHighlight(
      openInlineCommentOverlay(pr({ comments: [COMMENTS[0]!, comment("draft", 2)] }), "src/a.ts", 1, "RIGHT"),
      1,
    )

    expect(targetOf(local)).toBeNull()
  })

  test("is the overview's cursor in the overview when the panel is open but focus is elsewhere", () => {
    const state = { ...onSecond({ viewMode: "state" }), focusedPanel: "diff" as const }

    expect(targetOf(state)).toEqual(OVERVIEW)
  })

  test("asks the overview only when the overview is on screen", () => {
    let asked = 0
    const ask = () => {
      asked++
      return OVERVIEW
    }

    reactionTargetOf(pr(), ask)
    reactionTargetOf(pr({ viewMode: "feed" }), ask)
    reactionTargetOf(onSecond(), ask)
    expect(asked).toBe(0)

    reactionTargetOf(pr({ viewMode: "state" }), ask)
    expect(asked).toBe(1)
  })

  test("stays on the highlighted comment when focus goes back to the diff with the panel open", () => {
    const state = { ...onSecond(), focusedPanel: "diff" as const }

    expect(targetOf(state)).toEqual({ kind: "review-comment", githubId: 22 })
  })

  test("is nothing in the diff with the panel closed", () => {
    expect(targetOf(closeInlineCommentOverlay(onSecond()))).toBeNull()
    expect(targetOf(pr())).toBeNull()
  })

  test("is nothing in the feed, panel or not, unless the panel has focus", () => {
    expect(targetOf(pr({ viewMode: "feed" }))).toBeNull()
    expect(targetOf({ ...onSecond({ viewMode: "feed" }), focusedPanel: "diff" })).toBeNull()
  })
})
