import { describe, expect, test } from "bun:test"
import { treeRowsOf } from "../../components/FileTree"
import type { AppState } from "../../state"
import type { Comment, FileReviewStatus } from "../../types"
import { createVisitWatermark } from "../../utils/visit"
import type { PendingReview, PrCommit } from "../../providers/github/types"
import { prInfo } from "../../testing/pr-info"
import { deferred, refreshHarness, THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import { handleRefresh } from "./handlers"

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path

/** A refresh swallows its own errors into a toast, which would pass a test for the wrong reason. */
async function landed(refreshing: Promise<void>, state: () => AppState) {
  await refreshing
  expect(state().toast?.type).toBeOneOf(["success", "info"])
}

describe("a refresh's tree highlight", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`moved while the viewed states load, stays on the moved-to file (${appMode})`, async () => {
      const reached = deferred<void>()
      const statuses = deferred<FileReviewStatus[]>()
      const { ctx, state } = refreshHarness({
        appMode,
        state: (s) => ({ ...s, treeUnviewedOnly: true, treeHighlightIndex: 0 }),
        sources: {
          loadViewedStatuses: () => {
            reached.resolve()
            return statuses.promise
          },
        },
      })
      expect(highlighted(state())).toBe("a.ts")

      const refreshing = handleRefresh(ctx)
      await reached.promise
      // `j` twice in the tree.
      ctx.setState((s) => ({ ...s, treeHighlightIndex: 2 }))
      expect(highlighted(state())).toBe("c.ts")
      // Hides a row above the highlight.
      statuses.resolve([{ filename: "a.ts", viewed: true }])
      await landed(refreshing, state)

      expect(highlighted(state())).toBe("c.ts")
    })
  }
})

describe("a refresh's feed", () => {
  test("a PR refresh drops the stream, and re-reads the timeline only while the feed is on screen", async () => {
    for (const [viewMode, reloads] of [["diff", 0], ["feed", 1]] as const) {
      const { ctx, calls, state } = refreshHarness({ state: (s) => ({ ...s, viewMode }) })
      await landed(handleRefresh(ctx), state)
      expect(calls.forgetStream).toBe(1)
      expect(calls.reloadFeed).toBe(reloads)
    }
  })
})

describe("a refresh's overlays", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`closes the help (${appMode})`, async () => {
      const { ctx, help, state } = refreshHarness({ appMode })
      help.toggle()
      await landed(handleRefresh(ctx), state)
      expect(help.open()).toBe(false)
    })
  }
})

describe("a refresh's visit", () => {
  // Young enough that markVisit keeps them: the next visit could still take them for new.
  const young = (id: string): Comment => ({
    id,
    filename: "a.ts",
    line: 1,
    side: "RIGHT",
    body: id,
    createdAt: "2999-01-01T00:00:00Z",
    status: "synced",
  })

  function session(comments: Comment[], commits?: PrCommit[]) {
    return {
      prInfo: prInfo("", { commits }),
      diff: THREE_TOP_LEVEL_FILES,
      comments,
      viewedStatuses: new Map(),
      headSha: "head-2",
    }
  }

  test("a PR refresh writes what was seen into the new watermark, takes it and the rebased flag, and starts seeing afresh", async () => {
    const comments = [young("seen"), young("unseen")]
    const rewritten = [{ sha: "abc1234", message: "rewritten", author: "you", date: "2026-09-11T10:00:00Z" }]
    const { ctx, state, visit, calls } = refreshHarness({
      comments,
      sources: { loadPrSession: async () => session(comments, rewritten) },
    })
    visit.begin(createVisitWatermark("head-1"), false)
    visit.markSeen(["seen"])
    visit.setChangedFiles(new Set(["a.ts"]))

    await landed(handleRefresh(ctx), state)

    expect(calls.saveVisit).toHaveLength(1)
    const saved = calls.saveVisit[0]!
    expect(saved.source).toBe(state().source)
    expect(saved.watermark).toMatchObject({ lastSeenHeadSha: "head-2", seenCommentIds: ["seen"] })
    expect(visit.watermark()).toBe(saved.watermark)
    expect(visit.rebased()).toBe(true)
    expect(visit.seen().size).toBe(0)
    expect(visit.changedFiles().size).toBe(0)
  })

  test("a PR refresh marks as seen what was on screen when it began, not what is seen while it loads", async () => {
    const comments = [young("early"), young("late")]
    const reached = deferred<void>()
    const loaded = deferred<ReturnType<typeof session>>()
    const { ctx, state, visit, calls } = refreshHarness({
      comments,
      sources: {
        loadPrSession: () => {
          reached.resolve()
          return loaded.promise
        },
      },
    })
    visit.begin(createVisitWatermark("head-1"), false)
    visit.markSeen(["early"])

    const refreshing = handleRefresh(ctx)
    await reached.promise
    visit.markSeen(["late"])
    loaded.resolve(session(comments))
    await landed(refreshing, state)

    expect(calls.saveVisit.map((call) => call.watermark.seenCommentIds)).toEqual([["early"]])
  })

  test("a PR refresh whose new diff fails to parse still saves the watermark", async () => {
    const comments = [young("early")]
    const { ctx, state, visit, calls } = refreshHarness({
      comments,
      sources: { loadPrSession: async () => ({ ...session(comments), diff: null as unknown as string }) },
    })
    visit.begin(createVisitWatermark("head-1"), false)
    visit.markSeen(["early"])

    await handleRefresh(ctx)

    expect(state().toast).toMatchObject({ type: "error" })
    expect(calls.saveVisit.map((call) => call.watermark.seenCommentIds)).toEqual([["early"]])
  })

  test("a PR review without its PR info reloads as local, and drops its visit", async () => {
    const { ctx, state, visit, calls } = refreshHarness({ state: (s) => ({ ...s, prInfo: null }) })
    visit.begin(createVisitWatermark("head-1"), false)

    await landed(handleRefresh(ctx), state)

    expect(state().appMode).toBe("local")
    expect(visit.watermark()).toBeNull()
    expect(calls.saveVisit).toEqual([])
  })
})

describe("a refresh's pending review", () => {
  const draft: PendingReview = {
    id: 7,
    user: "octo",
    body: "",
    comments: [{ id: 1, body: "Draft one", path: "a.ts", line: 2, side: "RIGHT" }],
  }
  const pendingIn = (state: AppState) => state.comments.filter((c) => c.status === "pending").map((c) => c.id)

  test("a PR refresh fetches the reloaded PR's draft again", async () => {
    const asked: string[] = []
    const { ctx, state, pendingReview } = refreshHarness({
      sources: {
        getPendingReview: async (owner, repo, number) => {
          asked.push(`${owner}/${repo}#${number}`)
          return draft
        },
      },
    })
    pendingReview.set({ ...draft, id: 6, comments: [] })

    await landed(handleRefresh(ctx), state)
    await Bun.sleep(0)

    expect(asked).toEqual(["owner/repo#1259"])
    expect(pendingReview.review()).toBe(draft)
    expect(pendingIn(state())).toEqual(["pending-1"])
  })

  test("a draft that lands after riff moved to another PR stays out of it", async () => {
    const fetched = deferred<PendingReview | null>()
    const { ctx, state, pendingReview } = refreshHarness({
      sources: { getPendingReview: () => fetched.promise },
    })

    await landed(handleRefresh(ctx), state)
    // Another PR opened, then a local review, while the draft was on its way.
    ctx.setState((s) => ({ ...s, prInfo: prInfo("", { number: 1300 }) }))
    ctx.setState((s) => ({ ...s, appMode: "local", prInfo: null }))
    fetched.resolve(draft)
    await Bun.sleep(0)

    expect(pendingReview.review()).toBeNull()
    expect(pendingIn(state())).toEqual([])
  })

  test("a local reload fetches no draft", async () => {
    const { ctx, state } = refreshHarness({
      appMode: "local",
      sources: {
        getPendingReview: () => {
          throw new Error("a local reload asked GitHub for a draft")
        },
      },
    })
    await landed(handleRefresh(ctx), state)
  })
})
