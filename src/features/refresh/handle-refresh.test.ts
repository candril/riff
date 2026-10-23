import { describe, expect, test } from "bun:test"
import { treeRowsOf } from "../../components/FileTree"
import type { AppState } from "../../state"
import type { Comment, FileReviewStatus } from "../../types"
import { createVisitWatermark } from "../../utils/visit"
import type { PendingReview, PrCommit } from "../../providers/github/types"
import { prInfo } from "../../testing/pr-info"
import { deferred, refreshHarness, THREE_TOP_LEVEL_FILES } from "../../testing/refresh-harness"
import type { ToastState } from "../toast/state"
import { handleRefresh } from "./handlers"

const highlighted = (state: AppState) => treeRowsOf(state)[state.treeHighlightIndex]?.node.path

/** A refresh swallows its own errors into a toast, which would pass a test for the wrong reason. */
async function landed(refreshing: Promise<void>, toast: Pick<ToastState, "current">) {
  await refreshing
  expect(toast.current()?.type).toBeOneOf(["success", "info"])
}

describe("a refresh's tree highlight", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`moved while the viewed states load, stays on the moved-to file (${appMode})`, async () => {
      const reached = deferred<void>()
      const statuses = deferred<FileReviewStatus[]>()
      const { ctx, state, toast } = refreshHarness({
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
      await landed(refreshing, toast)

      expect(highlighted(state())).toBe("c.ts")
    })
  }
})

describe("a refresh's feed", () => {
  test("a PR refresh drops the stream, and re-reads the timeline only while the feed is on screen", async () => {
    for (const [viewMode, reloads] of [["diff", 0], ["feed", 1]] as const) {
      const { ctx, calls, state, toast } = refreshHarness({ state: (s) => ({ ...s, viewMode }) })
      await landed(handleRefresh(ctx), toast)
      expect(calls.forgetStream).toBe(1)
      expect(calls.reloadFeed).toBe(reloads)
    }
  })
})

describe("a refresh's toast", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`says it is refreshing until the rebuild lands, then how the cursor landed (${appMode})`, async () => {
      const reached = deferred<void>()
      const statuses = deferred<FileReviewStatus[]>()
      const { ctx, toast } = refreshHarness({
        appMode,
        sources: {
          loadViewedStatuses: () => {
            reached.resolve()
            return statuses.promise
          },
        },
      })
      const refreshing = handleRefresh(ctx)
      expect(toast.current()).toEqual({ message: "Refreshing...", type: "info" })
      await reached.promise
      expect(toast.current()).toBeNull()
      statuses.resolve([])
      await refreshing
      expect(toast.current()).toEqual({ message: "Refreshed", type: "success" })
    })
  }
})

describe("a refresh's overlays", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`closes the help (${appMode})`, async () => {
      const { ctx, help, state, toast } = refreshHarness({ appMode })
      help.toggle()
      await landed(handleRefresh(ctx), toast)
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
    const { ctx, state, visit, calls, toast } = refreshHarness({
      comments,
      sources: { loadPrSession: async () => session(comments, rewritten) },
    })
    visit.begin(createVisitWatermark("head-1"), false)
    visit.markSeen(["seen"])
    visit.setChangedFiles(new Set(["a.ts"]))

    await landed(handleRefresh(ctx), toast)

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
    const { ctx, state, visit, calls, toast } = refreshHarness({
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
    await landed(refreshing, toast)

    expect(calls.saveVisit.map((call) => call.watermark.seenCommentIds)).toEqual([["early"]])
  })

  test("a PR refresh whose new diff fails to parse still saves the watermark", async () => {
    const comments = [young("early")]
    const { ctx, state, visit, calls, toast } = refreshHarness({
      comments,
      sources: { loadPrSession: async () => ({ ...session(comments), diff: null as unknown as string }) },
    })
    visit.begin(createVisitWatermark("head-1"), false)
    visit.markSeen(["early"])

    await handleRefresh(ctx)

    expect(toast.current()).toMatchObject({ type: "error" })
    expect(calls.saveVisit.map((call) => call.watermark.seenCommentIds)).toEqual([["early"]])
  })

  test("a PR review without its PR info reloads as local, and drops its visit", async () => {
    const { ctx, state, visit, calls, toast } = refreshHarness({ state: (s) => ({ ...s, prInfo: null }) })
    visit.begin(createVisitWatermark("head-1"), false)

    await landed(handleRefresh(ctx), toast)

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
    const { ctx, state, pendingReview, toast } = refreshHarness({
      sources: {
        getPendingReview: async (owner, repo, number) => {
          asked.push(`${owner}/${repo}#${number}`)
          return draft
        },
      },
    })
    pendingReview.set({ ...draft, id: 6, comments: [] })

    await landed(handleRefresh(ctx), toast)
    await Bun.sleep(0)

    expect(asked).toEqual(["owner/repo#1259"])
    expect(pendingReview.review()).toBe(draft)
    expect(pendingIn(state())).toEqual(["pending-1"])
  })

  test("a draft that lands after riff moved to another PR stays out of it", async () => {
    const fetched = deferred<PendingReview | null>()
    const { ctx, state, pendingReview, toast } = refreshHarness({
      sources: { getPendingReview: () => fetched.promise },
    })

    await landed(handleRefresh(ctx), toast)
    // Another PR opened, then a local review, while the draft was on its way.
    ctx.setState((s) => ({ ...s, prInfo: prInfo("", { number: 1300 }) }))
    ctx.setState((s) => ({ ...s, appMode: "local", prInfo: null }))
    fetched.resolve(draft)
    await Bun.sleep(0)

    expect(pendingReview.review()).toBeNull()
    expect(pendingIn(state())).toEqual([])
  })

  test("a local reload fetches no draft", async () => {
    const { ctx, state, toast } = refreshHarness({
      appMode: "local",
      sources: {
        getPendingReview: () => {
          throw new Error("a local reload asked GitHub for a draft")
        },
      },
    })
    await landed(handleRefresh(ctx), toast)
  })
})

describe("a refresh's diff display options", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`keeps split, wrap and table alignment as the reader left them (${appMode})`, async () => {
      const { ctx, toast, diffOptions } = refreshHarness({ appMode })
      diffOptions.toggleSplit()
      diffOptions.toggleWrap()

      await landed(handleRefresh(ctx), toast)

      expect({ split: diffOptions.splitView(), wrap: diffOptions.wrapLines(), align: diffOptions.alignMarkdownTables() }).toEqual({
        split: true,
        wrap: true,
        align: true,
      })
    })
  }
})

const FENCED_DOC = `diff --git a/doc.md b/doc.md
index 1111111..2222222 100644
--- a/doc.md
+++ b/doc.md
@@ -1,5 +1,5 @@
 intro
 ~~~sh
-echo hi
+echo hello
 ~~~
 end
`

describe("a refresh's fenced-block folds", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`keeps a folded block folded (${appMode})`, async () => {
      const { ctx, toast, blockFolds, mapping } = refreshHarness({ appMode, diff: FENCED_DOC })
      const id = mapping().foldableBlocks[0]!.id
      blockFolds.toggle(id)
      ctx.rebuildLineMapping()

      await landed(handleRefresh(ctx), toast)

      expect(blockFolds.isCollapsed(id)).toBe(true)
      expect(mapping().allLines.some((line) => line.blockFoldId === id)).toBe(true)
    })
  }
})

describe("a refresh's composer pickers", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`closes both, with the panel the reload closes (${appMode})`, async () => {
      const { ctx, toast, composerPickers } = refreshHarness({ appMode })
      composerPickers.setMention({ query: "da", atOffset: 0 })
      composerPickers.setEmoji({ query: "smil", colonOffset: 4 })

      await landed(handleRefresh(ctx), toast)

      expect([composerPickers.mention(), composerPickers.emoji()]).toEqual([null, null])
    })
  }
})

describe("a refresh's chat column", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`keeps the keys in the chat (${appMode})`, async () => {
      const { ctx, toast, state } = refreshHarness({ appMode })
      ctx.setState((s) => ({ ...s, focusedPanel: "chat" }))

      await landed(handleRefresh(ctx), toast)

      expect(state().focusedPanel).toBe("chat")
    })
  }
})

describe("a refresh's file folds", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`keeps a folded file folded (${appMode})`, async () => {
      const { ctx, toast, fileFolds, mapping } = refreshHarness({ appMode })
      fileFolds.toggle("a.ts")
      ctx.rebuildLineMapping()

      await landed(handleRefresh(ctx), toast)

      expect([...fileFolds.collapsed()]).toEqual(["a.ts"])
      expect(mapping().allLines.filter((line) => line.filename === "a.ts").map((line) => line.type)).toEqual(["file-header"])
    })

    test(`folds a file that became viewed during the reload on top of the kept folds (${appMode})`, async () => {
      const { ctx, toast, fileFolds } = refreshHarness({
        appMode,
        sources: { loadViewedStatuses: async () => [{ filename: "b.ts", viewed: true }] },
      })
      fileFolds.toggle("a.ts")

      await landed(handleRefresh(ctx), toast)

      expect([...fileFolds.collapsed()].sort()).toEqual(["a.ts", "b.ts"])
    })

    test(`keeps a fold toggled while the reload was awaited (${appMode})`, async () => {
      const reached = deferred<void>()
      const held = deferred<void>()
      const hold = async <T>(value: T): Promise<T> => {
        reached.resolve()
        await held.promise
        return value
      }
      const { ctx, toast, fileFolds } = refreshHarness({
        appMode,
        sources: {
          loadPrSession: () =>
            hold({ prInfo: prInfo(""), diff: THREE_TOP_LEVEL_FILES, comments: [], viewedStatuses: new Map(), headSha: "head-2" }),
          getLocalDiff: () => hold(THREE_TOP_LEVEL_FILES),
        },
      })
      fileFolds.toggle("a.ts")

      const refreshing = handleRefresh(ctx)
      await reached.promise
      fileFolds.toggle("a.ts")
      fileFolds.toggle("c.ts")
      held.resolve()
      await landed(refreshing, toast)

      expect([...fileFolds.collapsed()]).toEqual(["c.ts"])
    })
  }
})

describe("a refresh's time", () => {
  for (const appMode of ["pr", "local"] as const) {
    test(`is stamped once the rebuild lands (${appMode})`, async () => {
      const { ctx, toast, lastRefresh } = refreshHarness({ appMode })

      await landed(handleRefresh(ctx), toast)

      expect(lastRefresh.at()).toBe("1")
    })
  }

  test("is left alone by a refresh whose load fails", async () => {
    const { ctx, toast, lastRefresh } = refreshHarness({
      sources: {
        loadPrSession: async () => {
          throw new Error("gh is down")
        },
      },
    })

    await handleRefresh(ctx)

    expect(toast.current()).toMatchObject({ type: "error" })
    expect(lastRefresh.at()).toBe("0")
  })

  test("is left alone by a local reload whose diff fails to load", async () => {
    const { ctx, toast, lastRefresh } = refreshHarness({
      appMode: "local",
      sources: {
        getLocalDiff: async () => {
          throw new Error("git is gone")
        },
      },
    })

    await handleRefresh(ctx)

    expect(toast.current()).toMatchObject({ type: "error" })
    expect(lastRefresh.at()).toBe("0")
  })
})
