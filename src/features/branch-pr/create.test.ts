import { describe, expect, test } from "bun:test"
import { createFeedState } from "../feed/state"
import { branchPrHarness, prSession } from "../../testing/branch-pr-harness"
import { handleCreatePr, type CreatePrSources } from "./create"

function creator(sources: Partial<CreatePrSources> = {}) {
  const h = branchPrHarness({ state: (s) => ({ ...s, branchPr: null }) })
  const terminal: string[] = []
  const later: { ms: number }[] = []
  const created: string[] = []
  const ctx = {
    ...h.common,
    sources: {
      openPrCreator: async () => ({ title: "Title", body: "Body", draft: false }),
      createPullRequest: async (title: string) => {
        created.push(title)
        return { prNumber: 42, url: "https://github.com/owner/repo/pull/42" }
      },
      loadPrSession: async (n: number) => prSession(n),
      loadMarks: async () => [],
      followLoadedMarks: async () => [],
      loadPanelFilters: async () => ({ openThreadsOnly: false, unviewedFilesOnly: false }),
      ...sources,
    },
    suspend: () => { terminal.push("suspend") },
    resume: () => { terminal.push("resume") },
    later: (_fn: () => void, ms: number) => { later.push({ ms }) },
    setSearchState: () => {},
    forgetBaseLookups: () => {},
  }
  return { ...h, create: () => handleCreatePr(ctx), terminal, later, created }
}

describe("creating a pull request", () => {
  test("a PR the reader leaves unwritten creates nothing and keeps the local review", async () => {
    const h = creator({ openPrCreator: async () => null })
    const local = h.state()
    await h.create()
    expect(h.created).toEqual([])
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.state()).toBe(local)
  })

  test("swaps onto the PR it created, with nothing of the local review left in the factories", async () => {
    const h = creator()
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
    h.features.blockFolds.toggle("doc.md:0")

    await h.create()

    expect(h.state().appMode).toBe("pr")
    expect(h.state().source).toBe("gh:owner/repo#42")
    expect(h.headSha()).toBe("head-of-42")
    expect(h.common.toast.current()).toMatchObject({
      message: "PR #42 created: https://github.com/owner/repo/pull/42",
      type: "success",
    })
    expect(h.later).toEqual([{ ms: 4000 }])
    expect(h.common.activityFeed.snapshot()).toEqual(createFeedState().snapshot())
    expect(h.features.jumpList.list().entries).toHaveLength(0)
    expect(h.features.help.open()).toBe(false)
    expect(h.features.blockFolds.collapsed().size).toBe(0)
  })

  test("a PR gh will not create gives the terminal back once and says why", async () => {
    const h = creator({ createPullRequest: async () => { throw new Error("no upstream") } })
    const local = h.state()
    await h.create()
    expect(h.terminal).toEqual(["suspend", "resume"])
    expect(h.common.toast.current()).toMatchObject({ message: "Error: no upstream", type: "error" })
    expect(h.later).toEqual([{ ms: 3000 }])
    expect(h.state()).toBe(local)
  })
})
