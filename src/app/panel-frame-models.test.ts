import { describe, expect, test } from "bun:test"
import { createInitialState, openInlineCommentOverlay, toggleThreadPanelOpenOnly, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { commentPanelWidth } from "../features/inline-comment-overlay"
import { threadPanelModel } from "../components/thread-panel-model"
import type { Comment } from "../types"
import type { FeedEvent } from "../utils/feed"
import { feedFrameModel, prInfoPanelFrameModel, threadPanelFrameInput } from "./panel-frame-models"
import type { Frame } from "./frame"
import { emptyFeed } from "../features/feed/types"

const NOW = Date.parse("2026-01-10T12:00:00Z")

function comment(id: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/a.ts",
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    ...fields,
  }
}

const COMMENTS = [comment("open", 1), comment("resolved", 3, { isThreadResolved: true })]

const EVENTS: FeedEvent[] = [
  { id: "c1", type: "commit", at: "2026-01-10T11:00:00Z", actor: "alice", lead: "a1b2c3d", title: "fix: handle empty hunks" },
]

function base(patch: Partial<AppState> = {}): AppState {
  return { ...createInitialState([], [], "local", "local changes"), comments: COMMENTS, ...patch }
}

const panelOpen = (state: AppState) => openInlineCommentOverlay(state, "src/a.ts", 1, "RIGHT", "view")

function frame(
  state: AppState,
  {
    flash = {},
    width = 120,
    height = 40,
    now = NOW,
    mentions = { pool: [], searching: null },
    commentDrafts = new Map(),
    feed = { ...emptyFeed(), events: EVENTS },
    visit = null,
  }: { flash?: Partial<FlashState>; width?: number; height?: number; now?: number; mentions?: Frame["mentions"]; commentDrafts?: Frame["commentDrafts"]; feed?: Frame["feed"]; visit?: Frame["visit"] } = {}
): Frame {
  return {
    state,
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: createSearchState(),
    flashState: { ...createFlashState(), ...flash },
    cachedCurrentUser: null,
    width,
    height,
    now,
    diff: { columnInfo: null, selectionInfo: null },
    chatOpen: false,
    help: { open: false, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    reviewPreview: null,
    pendingReview: null,
    toast: null,
    lastRefreshedAt: "",
    prCommentInput: { open: false, text: "", loading: false, error: null },
    prInfoFilter: { filter: "", filterInput: false },
    filePicker: null,
    commentsPicker: null,
    occurrencePicker: null,
    marksPicker: null,
    marks: [],
    feed,
    visit,
    commitPicker: null,
    actionMenu: null,
    linePeek: null,
    blamePeek: null,
    mentions,
    commentDrafts,
    commandKeys: new Map(),
    actionFocus: { reactionTarget: null },
  }
}

describe("threadPanelFrameInput", () => {
  test("is null while the panel is closed", () => {
    expect(threadPanelFrameInput(frame(base()))).toBeNull()
  })

  test("takes its width and clock from the frame", () => {
    const input = threadPanelFrameInput(frame(panelOpen(base()), { width: 90, now: NOW + 1 }))!
    expect(input.width).toBe(commentPanelWidth(90, false))
    expect(input.now).toBe(NOW + 1)
    expect(input.comments.map((c) => c.id)).toEqual(["open", "resolved"])
    const ages = (now: number) =>
      threadPanelModel(threadPanelFrameInput(frame(panelOpen(base()), { now }))!).threads.map((thread) => thread.comments[0]?.time)
    expect(ages(NOW)).not.toEqual(ages(NOW + 48 * 3600_000))
  })

  test("offers the @mention pool behind the participants, and says which query is being searched", () => {
    const input = threadPanelFrameInput(frame(panelOpen(base()), { mentions: { pool: ["dana"], searching: "da" } }))!
    expect(input.mentionCandidates.at(-1)).toBe("dana")
    expect(input.mentionSearchQuery).toBe("da")
  })

  test("offers the draft kept on the panel's line, and none kept elsewhere", () => {
    const kept = (drafts: [string, string][]) => threadPanelFrameInput(frame(panelOpen(base()), { commentDrafts: new Map(drafts) }))!.draft
    expect(kept([["src/a.ts:1:RIGHT", "half a thought"]])).toBe("half a thought")
    expect(kept([["src/a.ts:2:RIGHT", "half a thought"]])).toBe("")
  })

  test("counts the threads open-only hides while it is on, and is null for it while it is off", () => {
    expect(threadPanelFrameInput(frame(panelOpen(base())))!.openOnly).toBeNull()
    expect(threadPanelFrameInput(frame(toggleThreadPanelOpenOnly(panelOpen(base()))))!.openOnly).toEqual({ hidden: 1 })
  })

  test("carries flash labels only while the comments are being labelled", () => {
    const rows = [{ id: "open", label: "a" }]
    const labelled = (surface: FlashState["surface"]) =>
      threadPanelFrameInput(frame(panelOpen(base()), { flash: { active: true, surface, rows } }))!.flashLabels
    expect([...labelled("comments")]).toEqual([["open", "a"]])
    expect(labelled("feed").size).toBe(0)
  })
})

describe("feedFrameModel", () => {
  test("is null outside the feed view, and while an error takes the screen", () => {
    expect(feedFrameModel(frame(base()))).toBeNull()
    expect(feedFrameModel(frame(base({ viewMode: "state" })))).toBeNull()
    expect(feedFrameModel(frame(base({ viewMode: "feed", error: "boom" })))).toBeNull()
    expect(feedFrameModel(frame(base({ viewMode: "feed" })))).not.toBeNull()
  })

  test("dates its rows against the frame's clock and windows them to the frame's height", () => {
    const at = (now: number, height = 40) => feedFrameModel(frame(base({ viewMode: "feed" }), { now, height }))!
    expect(at(NOW)).toEqual(at(NOW))
    expect(at(NOW).rows).not.toEqual(at(NOW + 48 * 3600_000).rows)
    const many = Array.from({ length: 60 }, (_, i) => ({ ...EVENTS[0]!, id: `c${i}` }))
    const tall = (height: number) =>
      feedFrameModel(frame(base({ viewMode: "feed" }), { height, feed: { ...emptyFeed(), events: many } }))!.rows.length
    expect(tall(20)).toBeLessThan(tall(50))
  })

  test("narrows to what is unseen against the frame's watermark, and to nothing without one", () => {
    const events: FeedEvent[] = [
      { id: "e-open", type: "comment", at: "2026-01-10T10:00:00Z", title: "open", target: { kind: "comment", commentId: "open" } },
      { id: "e-resolved", type: "comment", at: "2026-01-10T10:00:00Z", title: "resolved", target: { kind: "comment", commentId: "resolved" } },
    ]
    const visit = { lastVisitAt: "2026-01-09T00:00:00Z", lastSeenHeadSha: "", seenCommentIds: ["resolved"] }
    const feed = { ...emptyFeed(), events, unseenOnly: true }
    const shown = (watermark: Frame["visit"]) =>
      feedFrameModel(frame(base({ viewMode: "feed" }), { feed, visit: watermark }))!
    const rows = shown(visit).rows
    expect(rows.map((row) => row.key)).toEqual(["e-open"])
    expect(rows[0]).toMatchObject({ state: "unseen" })
    expect(shown(null).rows).toEqual([])
  })

  test("carries flash labels only while the feed is being labelled", () => {
    const rows = [{ id: "0", label: "a" }]
    const labelled = (surface: FlashState["surface"]) =>
      feedFrameModel(frame(base({ viewMode: "feed" }), { flash: { active: true, surface, rows } }))!
    expect(labelled("feed")).not.toEqual(labelled("comments"))
  })
})

describe("prInfoPanelFrameModel", () => {
  const filtered = (prInfoFilter: Frame["prInfoFilter"]) => ({ ...frame(base()), prInfoFilter })

  test("is handed whatever the view, closed and unlabelled at rest", () => {
    for (const viewMode of ["diff", "feed", "state"] as const) {
      expect(prInfoPanelFrameModel(frame(base({ viewMode })))).toEqual({
        flashLabels: new Map(),
        filterOpen: false,
        filter: "",
        commentInput: { open: false, text: "", loading: false, error: null },
      })
    }
  })

  test("carries flash labels only while the PR panel is being labelled", () => {
    const rows = [{ id: "files:1", label: "sd" }]
    const labelled = (surface: FlashState["surface"]) =>
      prInfoPanelFrameModel(frame(base({ viewMode: "state" }), { flash: { active: true, surface, rows } })).flashLabels
    expect([...labelled("state")]).toEqual([["files:1", "sd"]])
    expect(labelled("comments").size).toBe(0)
  })

  test("carries the filter, open or closed", () => {
    expect(prInfoPanelFrameModel(filtered({ filterInput: true, filter: "greet" }))).toMatchObject({
      filterOpen: true,
      filter: "greet",
    })
    expect(prInfoPanelFrameModel(filtered({ filterInput: false, filter: "greet" }))).toMatchObject({
      filterOpen: false,
      filter: "greet",
    })
  })

  test("passes the comment prompt's fields through", () => {
    const prompt = { open: true, text: "hi", loading: true, error: "boom" }
    const model = prInfoPanelFrameModel({ ...frame(base()), prCommentInput: prompt })
    expect(model.commentInput).toEqual({ open: true, text: "hi", loading: true, error: "boom" })
  })
})
