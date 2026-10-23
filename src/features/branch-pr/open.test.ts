import { describe, expect, test } from "bun:test"
import type { AppState } from "../../state"
import type { PendingReview } from "../../providers/github/types"
import { createFeedState } from "../feed/state"
import { branchPrHarness, prSession, type BranchPrHarnessOptions } from "../../testing/branch-pr-harness"
import { deferred } from "../../testing/refresh-harness"
import { createBranchPrOpener, type OpenBranchPrSources } from "./open"

function opener(options: BranchPrHarnessOptions & { sources?: Partial<OpenBranchPrSources> } = {}) {
  const h = branchPrHarness(options)
  const called: string[] = []
  const logged = <A extends unknown[], R>(name: string, fn: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<R> => {
      called.push(name)
      return fn(...args)
    }
  const sources: OpenBranchPrSources = {
    getCurrentRepo: logged("getCurrentRepo", async () => ({ owner: "owner", repo: "repo" })),
    loadPrSession: logged("loadPrSession", options.sources?.loadPrSession ?? (async (n: number) => prSession(n))),
    loadOrCreateSession: logged("loadOrCreateSession", async (source: string) => ({
      id: "s",
      source,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })),
    loadPanelFilters: logged("loadPanelFilters", async () => ({ openThreadsOnly: false, unviewedFilesOnly: false })),
    loadInfoSections: logged("loadInfoSections", async () => new Set()),
    loadMarks: logged("loadMarks", async () => []),
    followLoadedMarks: logged("followLoadedMarks", async () => []),
    loadViewedStatuses: logged("loadViewedStatuses", options.sources?.loadViewedStatuses ?? (async () => [])),
  }
  const open = createBranchPrOpener({
    ...h.common,
    sources,
    recreatePrInfoPanel: () => {},
    updateFileTreePanel: () => {},
    pendingReviewLoad: h.pendingReviewLoad,
  })
  return { ...h, open, called }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("opening the branch's pull request", () => {
  test("puts the PR on screen, in the view asked for, at the head it loaded", async () => {
    const h = opener()
    await h.open("feed")
    expect(h.state().appMode).toBe("pr")
    expect(h.state().source).toBe("gh:owner/repo#7")
    expect(h.state().viewMode).toBe("feed")
    expect(h.headSha()).toBe("head-of-7")

    const again = opener()
    await again.open("state")
    expect(again.state().viewMode).toBe("state")
  })

  test("leaves nothing of the local review in the factories", async () => {
    const h = opener()
    h.common.activityFeed.startLoading()
    h.common.activityFeed.toggleUnseen()
    h.features.jumpList.push({
      fileIndex: 0,
      filename: "a.ts",
      viewingCommit: null,
      viewMode: "diff",
      splitView: false,
      focusedPanel: "diff",
      anchor: null,
      cursorLine: 2,
    })
    h.features.help.toggle()
    h.features.prInfoFilter.set("needle")
    expect(h.common.activityFeed.snapshot()).not.toEqual(createFeedState().snapshot())

    await h.open("state")

    expect(h.common.activityFeed.snapshot()).toEqual(createFeedState().snapshot())
    expect(h.features.jumpList.list().entries).toHaveLength(0)
    expect(h.features.help.open()).toBe(false)
    expect(h.features.prInfoFilter.filter()).toBe("")
  })

  test("fetches the PR's pending review once the viewed statuses have landed, and shows its comment", async () => {
    const draft: PendingReview = {
      id: 99,
      user: "alice",
      body: "",
      comments: [{ id: 5, body: "pending thought", path: "a.ts", line: 2, side: "RIGHT" }],
    }
    const order: string[] = []
    const h = opener({
      getPendingReview: async () => {
        order.push("getPendingReview")
        return draft
      },
      sources: {
        loadViewedStatuses: async () => {
          await flush()
          order.push("loadViewedStatuses resolved")
          return []
        },
      },
    })

    await h.open("state")
    await flush()

    expect(order).toEqual(["loadViewedStatuses resolved", "getPendingReview"])
    expect(h.features.pendingReview.review()).toEqual(draft)
    expect(h.state().comments.map((c) => c.id)).toContain("pending-5")
  })

  test("a second ask while the first is loading fetches nothing", async () => {
    const held = deferred<ReturnType<typeof prSession>>()
    const h = opener({ sources: { loadPrSession: () => held.promise } })

    const first = h.open("state")
    await flush()
    await h.open("feed")
    held.resolve(prSession(7))
    await first

    expect(h.called.filter((c) => c === "loadPrSession")).toHaveLength(1)
    expect(h.called.filter((c) => c === "getCurrentRepo")).toHaveLength(1)
    expect(h.state().viewMode).toBe("state")
  })

  test("a load that fails says why, keeps the local review, and does not block the next ask", async () => {
    let fail = true
    const h = opener({
      sources: {
        loadPrSession: async (n: number) => {
          if (fail) throw new Error("boom")
          return prSession(n)
        },
      },
    })
    const local = h.state()

    await h.open("state")
    expect(h.common.toast.current()).toMatchObject({ message: "Could not open #7: boom", type: "error" })
    expect(h.state()).toBe(local)

    fail = false
    await h.open("state")
    expect(h.state().appMode).toBe("pr")
  })

  test.each([
    ["without a pull request on the branch", (s: AppState): AppState => ({ ...s, branchPr: null })],
    ["already in a pull request", (s: AppState): AppState => ({ ...s, appMode: "pr" })],
  ])("does nothing %s", async (_, state) => {
    const h = opener({ state })
    const before = h.state()
    await h.open("state")
    expect(h.called).toEqual([])
    expect(h.state()).toBe(before)
    expect(h.common.toast.current()).toBeNull()
  })
})
