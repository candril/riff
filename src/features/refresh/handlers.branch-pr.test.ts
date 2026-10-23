import { describe, expect, test } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import type { AppState } from "../../state"
import type { BranchPr } from "../../providers/current-pr"
import type { Comment } from "../../types"
import { getAvailableActions } from "../../actions"
import { headerModel } from "../../components/header-model"
import { createHeaderIsland } from "../../app/header"
import { mountRenderable } from "../../testing/frame"
import { refreshHarness } from "../../testing/refresh-harness"
import type { RefreshSources } from "./sources"
import { loadBranchPrReview } from "../branch-pr/review"
import { handleRefresh } from "./handlers"

const branchPr: BranchPr = { number: 7, title: "t", state: "OPEN", isDraft: false, url: "u" }
const onBranchPr = (s: AppState): AppState => ({ ...s, branchPr })

function comment(id: string, filename: string, line: number): Comment {
  return {
    id,
    filename,
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
  }
}

const local = [comment("local-1", "b.ts", 2)]
// a.ts has new-side lines 1 and 2 in the harness's diff; gone.ts is not in it.
const prReview = [comment("pr-1", "a.ts", 2), comment("pr-2", "gone.ts", 1)]

function localReload(state: (s: AppState) => AppState, review: RefreshSources["loadBranchPrReview"]) {
  return refreshHarness({ appMode: "local", comments: local, state, sources: { loadBranchPrReview: review } })
}

describe("a local reload on a branch with a pull request", () => {
  test("keeps the pull request riff found", async () => {
    const { ctx, state, toast } = localReload(onBranchPr, async () => [])
    await handleRefresh(ctx)
    expect(toast.current()?.type).toBeOneOf(["success", "info"])
    expect(state().branchPr).toEqual(branchPr)
  })

  test("reads the PR's stored review again, after the local comments, only where the diff has a row", async () => {
    const asked: BranchPr[] = []
    const { ctx, state } = localReload(onBranchPr, async (pr) => {
      asked.push(pr)
      return prReview
    })
    await handleRefresh(ctx)
    expect(asked).toEqual([branchPr])
    expect(state().comments.map((c) => c.id)).toEqual(["local-1", "pr-1"])
  })

  test("without a pull request asks for no review", async () => {
    let asked = 0
    const { ctx, state } = localReload((s) => s, async () => {
      asked++
      return prReview
    })
    await handleRefresh(ctx)
    expect(asked).toBe(0)
    expect(state().branchPr).toBeNull()
    expect(state().comments.map((c) => c.id)).toEqual(["local-1"])
  })

  test("a review riff cannot read leaves the rest of the reload standing", async () => {
    const { ctx, state, toast } = localReload(onBranchPr, (pr) =>
      loadBranchPrReview(pr, {
        getCurrentRepo: async () => { throw new Error("Not in a git repository") },
        loadComments: async () => { throw new Error("ENOENT") },
      })
    )
    await handleRefresh(ctx)
    expect(toast.current()?.type).toBeOneOf(["success", "info"])
    expect(state().branchPr).toEqual(branchPr)
    expect(state().comments.map((c) => c.id)).toEqual(["local-1"])
  })

  test("the header still names the PR, and the palette offers it rather than creating one", async () => {
    const { ctx, state } = localReload(onBranchPr, async () => [])
    await handleRefresh(ctx)
    const reloaded = state()

    const ids = getAvailableActions(reloaded).map((a) => a.id)
    expect(ids).toContain("open-branch-pr")
    expect(ids).not.toContain("create-pr")

    let header: ReturnType<typeof createHeaderIsland> | null = null
    const mounted = await mountRenderable((renderer) => {
      header = createHeaderIsland(renderer)
      const parent = new BoxRenderable(renderer, { width: "100%", height: 1 })
      parent.add(header.host)
      return parent
    }, { width: 80, height: 1 })
    header!.update({
      ...headerModel({
        title: "riff",
        totalFiles: reloaded.files.length,
        branchInfo: reloaded.branchInfo,
        branchPr: reloaded.branchPr,
        commits: reloaded.commits,
      }),
      version: "9.9.9",
    })
    expect(await mounted.frame()).toContain("#7")
    header!.dispose()
    await mounted.dispose()
  })
})
