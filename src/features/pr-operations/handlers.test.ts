import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { Comment } from "../../types"
import { prInfo } from "../../testing/pr-info"
import { createSyncPreviewState } from "../sync-preview/state"
import { handleExecuteSync, type PrOperationsContext, type SyncCalls } from "./handlers"

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
  const seen: string[] = []
  const ctx: PrOperationsContext = {
    getState: () => state,
    setState: (fn) => {
      state = fn(state)
    },
    render: () => {},
    source: "test",
    prInfo: prInfo(""),
    syncPreview,
  }
  const fail = () => {
    throw new Error("only an edit syncs here")
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
  return { ctx, calls, syncPreview, seen, state: () => state }
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
