import { describe, expect, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { PendingReview } from "../../providers/github/types"
import { prInfo } from "../../testing/pr-info"
import { deferred } from "../../testing/refresh-harness"
import { createPendingReviewState } from "./pending-state"
import { loadPendingReview } from "./load-pending"

const draft: PendingReview = {
  id: 7,
  user: "octo",
  body: "",
  comments: [{ id: 1, body: "Draft one", path: "a.ts", line: 2, side: "RIGHT" }],
}

const pr = prInfo("")

function harness(fetch: () => Promise<PendingReview | null>) {
  let state: AppState = { ...createInitialState([], [], "gh:owner/repo#1259", ""), appMode: "pr", prInfo: pr }
  let renders = 0
  const pendingReview = createPendingReviewState()
  const ctx = {
    getState: () => state,
    setState: (fn: (s: AppState) => AppState) => { state = fn(state) },
    render: () => { renders++ },
    pendingReview,
    fetch,
  }
  return { ctx, pendingReview, state: () => state, renders: () => renders }
}

const pendingIn = (state: AppState) =>
  state.comments.filter((c) => c.status === "pending").map((c) => `${c.id} ${c.body}`)

describe("loadPendingReview", () => {
  test("puts the fetched draft in place and its comments in the review as pending", async () => {
    const h = harness(async () => draft)
    await loadPendingReview(h.ctx, pr)
    expect(h.pendingReview.review()).toBe(draft)
    expect(pendingIn(h.state())).toEqual(["pending-1 Draft one"])
    expect(h.renders()).toBe(1)
  })

  for (const [where, move] of [
    ["another PR", (s: AppState): AppState => ({ ...s, prInfo: prInfo("", { number: 1300 }) })],
    ["a local review", (s: AppState): AppState => ({ ...s, appMode: "local", prInfo: null })],
  ] as const) {
    test(`writes nothing when riff moved to ${where} while it fetched`, async () => {
      const fetched = deferred<PendingReview | null>()
      const h = harness(() => fetched.promise)
      const loading = loadPendingReview(h.ctx, pr)
      h.ctx.setState(move)
      fetched.resolve(draft)
      await loading
      expect(h.pendingReview.review()).toBeNull()
      expect(pendingIn(h.state())).toEqual([])
      expect(h.renders()).toBe(0)
    })
  }

  test("a failed fetch changes nothing and says nothing", async () => {
    const h = harness(async () => {
      throw new Error("gh is down")
    })
    h.pendingReview.set(draft)
    const before = h.state()
    await loadPendingReview(h.ctx, pr)
    expect(h.pendingReview.review()).toBe(draft)
    expect(h.state()).toBe(before)
    expect(h.renders()).toBe(0)
  })
})
