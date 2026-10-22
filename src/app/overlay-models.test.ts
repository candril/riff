import { describe, expect, test } from "bun:test"
import { createInitialState, getInlineCommentOverlayComments, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { diffFile } from "../diff-rows/fixtures"
import { prInfo } from "../testing/pr-info"
import { version } from "../version"
import { reviewCandidates } from "../utils/publishable"
import { validateCommentsForSubmit } from "../features/comments"
import type { LineBlame } from "../providers/blame/source"
import type { Comment } from "../types"
import { toastModel } from "../components/notification-model"
import { confirmDialogModel } from "../components/confirm-dialog-model"
import { helpOverlayModel } from "../components/help-overlay-model"
import { reviewPreviewModel } from "../components/review-preview-model"
import { syncPreviewModel } from "../components/sync-preview-model"
import { gatherSyncItems } from "../components/sync-items"
import { blamePeekModel } from "../components/blame-peek-model"
import { diffPeekModel, hunkPeekModel } from "./peeks"
import { overlayModels } from "./overlay-models"
import type { Frame } from "./frame"

const NOW = Date.parse("2026-10-21T12:00:00Z")
const DAY = 24 * 60 * 60_000
const mapping = new DiffLineMapping([diffFile("a.ts", ["@@ -1 +1 @@", "+const a = 1"])], "all")
const initial = createInitialState([], [], "test", "")

function frame(patch: Partial<AppState> = {}, rest: Partial<Omit<Frame, "state">> = {}): Frame {
  return {
    state: { ...initial, ...patch },
    vimState: createCursorState(),
    mapping,
    searchState: createSearchState(),
    flashState: createFlashState(),
    cachedCurrentUser: null,
    width: 100,
    height: 30,
    now: NOW,
    diff: { columnInfo: null, selectionInfo: null },
    help: { open: false, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    ...rest,
  }
}

const blame: LineBlame = {
  line: {
    kind: "commit",
    commit: {
      sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      shortSha: "a1b2c3d4",
      author: "Ada Lovelace",
      date: "2026-10-18T09:30:00Z",
      subject: "Round totals once, at checkout",
    },
  },
  pr: null,
}
const blamePeek: AppState["blamePeek"] = {
  target: { path: "a.ts", side: "head", line: 1 },
  request: 1,
  status: "ready",
  result: blame,
}

const hunked: Comment = {
  id: "c1",
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: "Looks fine",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  diffHunk: "@@ -1 +1 @@\n+const a = 1",
}
const threadPanel = (open: boolean) => ({ ...initial.inlineCommentOverlay, open, codePeekId: "c1" })

describe("overlayModels", () => {
  test("is null for every overlay while none is shown", () => {
    expect(overlayModels(frame())).toEqual({
      toast: null,
      confirmDialog: null,
      helpOverlay: null,
      reviewPreview: null,
      syncPreview: null,
      diffPeek: null,
      blamePeek: null,
      hunkPeek: null,
    })
  })

  test("an open overlay's model is the one its builder makes", () => {
    const dialog = { title: "Clear?", message: "Gone." }
    const open = overlayModels(
      frame({
        toast: { message: "Saved", type: "success" },
        reviewPreview: { ...initial.reviewPreview, open: true },
        showLinePeek: true,
        blamePeek,
        comments: [hunked],
        inlineCommentOverlay: threadPanel(true),
      }, { help: { open: true, scroll: 2 }, confirmDialog: dialog, syncPreview: { loading: false, error: null } })
    )
    const state = frame().state
    expect(open.toast).toEqual(toastModel("Saved", "success"))
    expect(open.confirmDialog).toEqual(confirmDialogModel(dialog))
    expect(open.helpOverlay).toEqual(helpOverlayModel(version, 2, 30))
    expect(open.reviewPreview).toEqual(
      reviewPreviewModel(validateCommentsForSubmit(reviewCandidates([hunked]), state.files), { ...initial.reviewPreview, open: true }, false)
    )
    expect(open.syncPreview).toEqual(syncPreviewModel(gatherSyncItems([hunked]), { loading: false, error: null }))
    expect(open.diffPeek).toEqual(diffPeekModel(mapping, 0, "new", { row: 0, col: 0 }, 100, 30))
    expect(open.diffPeek).not.toBeNull()
    expect(open.blamePeek).toEqual(blamePeekModel({ ...blamePeek!, now: NOW, terminalWidth: 100, terminalHeight: 30 }))
    const comments = getInlineCommentOverlayComments({ ...initial, comments: [hunked], inlineCommentOverlay: threadPanel(true) })
    expect(open.hunkPeek).toEqual(hunkPeekModel(comments, "c1", 100, 30))
    expect(open.hunkPeek).not.toBeNull()
  })

  test("gl's and gb's peeks are drawn only over the diff", () => {
    for (const viewMode of ["feed", "state"] as const) {
      const models = overlayModels(frame({ viewMode, showLinePeek: true, blamePeek }))
      expect(models.diffPeek).toBeNull()
      expect(models.blamePeek).toBeNull()
    }
  })

  test("c's hunk peek is drawn only while the thread panel is open", () => {
    expect(overlayModels(frame({ comments: [hunked], inlineCommentOverlay: threadPanel(false) })).hunkPeek).toBeNull()
  })

  test("Submit Review on the user's own PR follows who riff knows the user to be", () => {
    const own = { reviewPreview: { ...initial.reviewPreview, open: true, selectedEvent: "APPROVE" as const }, prInfo: prInfo("") }
    expect(overlayModels(frame(own, { cachedCurrentUser: "someone" })).reviewPreview?.status.text).toBe("Cannot approve your own PR")
    expect(overlayModels(frame(own, { cachedCurrentUser: "else" })).reviewPreview?.status.text).not.toBe("Cannot approve your own PR")
    expect(overlayModels(frame(own)).reviewPreview?.status.text).not.toBe("Cannot approve your own PR")
  })

  test("a blame peek's age is measured from the frame's clock", () => {
    const at = (now: number) => JSON.stringify(overlayModels(frame({ blamePeek }, { now })).blamePeek)
    expect(at(NOW)).toContain("3d ago")
    expect(at(NOW + 4 * DAY)).toContain("7d ago")
  })
})
