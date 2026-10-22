import { describe, expect, test } from "bun:test"
import { createInitialState, withPendingComments, type AppState } from "../../state"
import type { Comment } from "../../types"
import type { PendingReview } from "../../providers/github/types"
import { prInfo } from "../../testing/pr-info"
import { createSyncPreviewState } from "../sync-preview/state"
import { createReviewPreviewState } from "../review-preview/state"
import { createPendingReviewState } from "../review-preview/pending-state"
import {
  handleConfirmReview,
  handleExecuteSync,
  type PrOperationsContext,
  type ReviewCalls,
  type SyncCalls,
} from "./handlers"

const edited: Comment = {
  id: "c1",
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: "Looks fine",
  localEdit: "Looks fine, ship it",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  githubId: 42,
}

function harness(comments: Comment[]) {
  let state: AppState = { ...createInitialState([], [], "test", ""), appMode: "pr", comments }
  const syncPreview = createSyncPreviewState()
  syncPreview.show()
  const reviewPreview = createReviewPreviewState()
  const pendingReview = createPendingReviewState()
  const seen: string[] = []
  const fail = () => {
    throw new Error("only an edit syncs here")
  }
  const reviewCalls: ReviewCalls = {
    getPrHeadSha: fail,
    submitReview: fail,
    getCurrentUser: fail,
    getPrComments: fail,
    saveComment: fail,
  }
  const ctx: PrOperationsContext = {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    render: () => {},
    source: "test",
    prInfo: prInfo(""),
    syncPreview,
    reviewPreview,
    pendingReview,
    reviewCalls,
  }
  const calls: SyncCalls = {
    updateComment: async (_owner, _repo, id, body) => {
      seen.push(`update ${id} while ${syncPreview.loading() ? "loading" : "idle"}: ${body}`)
      return { success: true, githubId: id }
    },
    submitReply: fail,
    submitSingleComment: fail,
    getPrHeadSha: fail,
    saveComment: async (comment) => {
      seen.push(`save ${comment.id}`)
    },
  }
  return { ctx, calls, reviewCalls, syncPreview, reviewPreview, pendingReview, seen, state: () => state }
}

describe("handleExecuteSync", () => {
  test("marks the preview loading while it sends, then closes it", async () => {
    const h = harness([edited])
    await handleExecuteSync(h.ctx, h.calls)
    expect(h.seen).toEqual(["update 42 while loading: Looks fine, ship it", "save c1"])
    expect([h.syncPreview.open(), h.syncPreview.loading()]).toEqual([false, false])
    expect(h.state().comments[0]).toMatchObject({ body: "Looks fine, ship it", localEdit: undefined })
    expect(h.state().toast.message).toBe("Synced 1 change")
  })

  test("closes the preview at once with nothing to sync", async () => {
    const h = harness([])
    await handleExecuteSync(h.ctx, h.calls)
    expect(h.seen).toEqual([])
    expect(h.syncPreview.open()).toBe(false)
    expect(h.state().toast.message).toBeNull()
  })
})

describe("handleConfirmReview", () => {
  test("with nothing to submit keeps Submit Review open and says what is missing, before any gh call", async () => {
    const h = harness([])
    h.reviewPreview.show()
    await handleConfirmReview(h.ctx)
    expect([h.reviewPreview.open(), h.reviewPreview.loading(), h.reviewPreview.error()]).toEqual([
      true,
      false,
      "Add a comment or summary to submit",
    ])
  })
})

describe("handleConfirmReview with GitHub's pending review", () => {
  const draft: PendingReview = {
    id: 7,
    user: "octo",
    body: "",
    comments: [
      { id: 1, body: "Draft one", path: "a.ts", line: 1, side: "RIGHT" },
      { id: 2, body: "Draft two", path: "a.ts", line: 2, side: "RIGHT" },
    ],
  }
  const pendingIds = (state: AppState) => state.comments.filter((c) => c.status === "pending").map((c) => c.id)

  function withDraft(submitted: { success: boolean; error?: string }) {
    const h = harness([])
    h.ctx.setState((s) => withPendingComments(s, draft))
    h.pendingReview.set(draft)
    h.reviewPreview.show()
    const sent: (number | undefined)[] = []
    h.reviewCalls.getPrHeadSha = async () => "head"
    h.reviewCalls.getCurrentUser = async () => "octo"
    h.reviewCalls.submitReview = async (_owner, _repo, _number, _comments, _sha, _event, _body, pendingReviewId) => {
      sent.push(pendingReviewId)
      return submitted
    }
    return { ...h, sent }
  }

  test("a submit forgets the draft and its comments, and the toast counts them once", async () => {
    const h = withDraft({ success: true })
    await handleConfirmReview(h.ctx)
    expect(h.sent).toEqual([7])
    expect(h.pendingReview.review()).toBeNull()
    expect(pendingIds(h.state())).toEqual([])
    expect(h.state().toast.message).toBe("Review submitted (2 comments) (merged with pending)")
  })

  test("a failed submit keeps the draft and its comments", async () => {
    const h = withDraft({ success: false, error: "nope" })
    await handleConfirmReview(h.ctx)
    expect(h.pendingReview.review()).toBe(draft)
    expect(pendingIds(h.state())).toEqual(["pending-1", "pending-2"])
  })
})
