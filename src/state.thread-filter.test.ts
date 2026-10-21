import { test, expect, describe } from "bun:test"
import {
  createInitialState,
  openInlineCommentOverlay,
  getInlineCommentOverlayComments,
  getInlineCommentOverlayDisplayOrder,
  getInlineCommentOverlayHiddenThreadCount,
  setCommentCodePeek,
  setThreadResolved,
  toggleThreadPanelOpenOnly,
  type AppState,
} from "./state"
import type { Comment } from "./types"
import type { DiffFile } from "./utils/diff-parser"

function comment(id: string, filename: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename,
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    ...fields,
  }
}

// Two open threads (one with a reply), one resolved with a reply, one outdated, and one open on another file.
const COMMENTS: Comment[] = [
  comment("open1", "src/a.ts", 1, { body: "rename this" }),
  comment("open1r", "src/a.ts", 1, { inReplyTo: "open1", author: "bob", body: "done" }),
  comment("res", "src/a.ts", 3, { isThreadResolved: true, body: "rename that" }),
  comment("resr", "src/a.ts", 3, { inReplyTo: "res", body: "ok" }),
  comment("old", "src/a.ts", 5, { outdated: true, body: "rename the old one" }),
  comment("open2", "src/a.ts", 7, { body: "a nit" }),
  comment("other", "src/b.ts", 2, { isThreadResolved: true }),
]

function panelOn(comments: Comment[], fields: Partial<AppState> = {}): AppState {
  const state = { ...createInitialState([], [], "local", "local changes"), comments, ...fields }
  return { ...openInlineCommentOverlay(state, "src/a.ts", 1, "RIGHT", "view"), focusedPanel: "comments" }
}

const ids = (comments: Comment[]) => comments.map((c) => c.id)
const shown = (state: AppState) => ids(getInlineCommentOverlayComments(state))
const order = (state: AppState) => ids(getInlineCommentOverlayDisplayOrder(state))
const highlightedId = (state: AppState) =>
  getInlineCommentOverlayDisplayOrder(state)[state.inlineCommentOverlay.highlightedIndex]?.id

describe("the thread panel's open-only toggle", () => {
  test("drops resolved and outdated threads, replies and all, and keeps an open thread's replies", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS))

    expect(state.threadPanelOpenOnly).toBe(true)
    expect(shown(state)).toEqual(["open1", "open1r", "open2"])
    expect(getInlineCommentOverlayHiddenThreadCount(state)).toBe(3)
  })

  test("counts the threads it hides, not their comments", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS.filter((c) => c.filename === "src/a.ts")))

    // `res` and `resr` are one thread.
    expect(getInlineCommentOverlayHiddenThreadCount(state)).toBe(2)
  })

  test("hides nothing and counts nothing while it is off", () => {
    const state = panelOn(COMMENTS)

    expect(shown(state)).toHaveLength(COMMENTS.length)
    expect(getInlineCommentOverlayHiddenThreadCount(state)).toBe(0)
  })

  test("applies within the panel's file scope and counts only there", () => {
    const files = [{ filename: "src/b.ts" } as DiffFile]
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS, { files, selectedFileIndex: 0 }))

    expect(shown(state)).toEqual([])
    expect(getInlineCommentOverlayHiddenThreadCount(state)).toBe(1)
  })

  test("applies after the `/` filter and counts only what the filter left", () => {
    const base = panelOn(COMMENTS)
    const filtered = { ...base, inlineCommentOverlay: { ...base.inlineCommentOverlay, filter: "rename" } }
    const state = toggleThreadPanelOpenOnly(filtered)

    expect(shown(state)).toEqual(["open1", "open1r"])
    // `res` and `old` match "rename"; `other` and `open2` never made it past `/`.
    expect(getInlineCommentOverlayHiddenThreadCount(state)).toBe(2)
  })

  test("keeps the highlight on the same comment when it stays shown", () => {
    const base = panelOn(COMMENTS)
    const onOpen2 = { ...base, inlineCommentOverlay: { ...base.inlineCommentOverlay, highlightedIndex: order(base).indexOf("open2") } }
    expect(highlightedId(onOpen2)).toBe("open2")

    const filtered = toggleThreadPanelOpenOnly(onOpen2)
    expect(highlightedId(filtered)).toBe("open2")
    expect(highlightedId(toggleThreadPanelOpenOnly(filtered))).toBe("open2")
  })

  test("clamps the highlight when the comment it was on is hidden", () => {
    const base = panelOn(COMMENTS)
    const last = { ...base, inlineCommentOverlay: { ...base.inlineCommentOverlay, highlightedIndex: order(base).length - 1 } }
    expect(highlightedId(last)).toBe("other")

    const state = toggleThreadPanelOpenOnly(last)
    expect(state.inlineCommentOverlay.highlightedIndex).toBe(order(state).length - 1)
    expect(highlightedId(state)).toBe("open2")
  })

  test("highlights nothing past the end when it hides everything", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS.filter((c) => c.id === "other")))

    expect(order(state)).toEqual([])
    expect(state.inlineCommentOverlay.highlightedIndex).toBe(0)
  })

  test("puts the code peek away when its comment is hidden, and leaves it up when not", () => {
    const peekOld = setCommentCodePeek(panelOn(COMMENTS), "old")
    expect(toggleThreadPanelOpenOnly(peekOld).inlineCommentOverlay.codePeekId).toBeNull()

    const peekOpen = setCommentCodePeek(panelOn(COMMENTS), "open2")
    expect(toggleThreadPanelOpenOnly(peekOpen).inlineCommentOverlay.codePeekId).toBe("open2")
  })

  test("resolving the highlighted thread takes it away and leaves the highlight at its index", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS))
    expect(order(state)).toEqual(["open1", "open1r", "open2"])
    const onOpen1 = { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, highlightedIndex: 0 } }

    const resolved = setThreadResolved(onOpen1, "open1", true)
    expect(order(resolved)).toEqual(["open2"])
    expect(resolved.inlineCommentOverlay.highlightedIndex).toBe(0)
    expect(highlightedId(resolved)).toBe("open2")
    expect(getInlineCommentOverlayHiddenThreadCount(resolved)).toBe(4)
  })

  test("resolving the last shown thread clamps the highlight back onto what is left", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS))
    const onOpen2 = { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, highlightedIndex: 2 } }

    const resolved = setThreadResolved(onOpen2, "open2", true)
    expect(order(resolved)).toEqual(["open1", "open1r"])
    expect(resolved.inlineCommentOverlay.highlightedIndex).toBe(1)
  })

  test("outlives the panel closing, being app state rather than the panel's", () => {
    const state = toggleThreadPanelOpenOnly(panelOn(COMMENTS))
    const reopened = openInlineCommentOverlay({ ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, open: false } }, "src/a.ts", 1, "RIGHT", "view")

    expect(reopened.threadPanelOpenOnly).toBe(true)
    expect(shown(reopened)).toEqual(["open1", "open1r", "open2"])
  })
})
