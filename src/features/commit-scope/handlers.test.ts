import { describe, expect, test } from "bun:test"
import type { AppState } from "../../state"
import { commitsReview, loadContext, patch } from "../../testing/commit-scope"
import { parseDiff } from "../../utils/diff-parser"
import { createFileContentState } from "../file-content/state"
import { createFileFoldsState } from "../folds/file-folds-state"
import { createToastState } from "../toast/state"
import { createCommitDiffsState } from "./diffs-state"
import { handleCommitSelected, type CommitSelectionContext } from "./handlers"

/** The commit picker's selection on a PR review, with the commit's patch from `fetchCommitDiff`. */
function selecting(fetchCommitDiff: (sha: string) => Promise<string>) {
  const whole = parseDiff([patch("a.ts", "one"), patch("b.ts", "two")].join("\n"))
  let state: AppState = { ...commitsReview("pr"), files: whole, allFiles: whole }
  const fetched: string[] = []
  const revealed: number[] = []
  const commitDiffs = createCommitDiffsState()
  const toast = createToastState()
  const ctx: CommitSelectionContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    commitDiffs,
    fileContent: createFileContentState(),
    fileFolds: createFileFoldsState(),
    toast,
    render: () => {},
    resetCursor: () => {},
    rebuildLineMapping: () => {},
    revealFileAtTop: (fileIndex) => void revealed.push(fileIndex),
    load: loadContext(state, {
      getState: () => state,
      fetchCommitDiff: (_owner, _repo, sha) => {
        fetched.push(sha)
        return fetchCommitDiff(sha)
      },
    }),
  }
  return { ctx, state: () => state, fetched, revealed, commitDiffs, toast }
}

const onlyB = async () => patch("b.ts", "two")

describe("handleCommitSelected", () => {
  test("fetches an uncached commit once, keeps it and scopes the review to it", async () => {
    const { ctx, state, fetched, commitDiffs, toast } = selecting(onlyB)

    await handleCommitSelected(ctx, "ccc3333")

    expect(fetched).toEqual(["ccc3333"])
    expect(commitDiffs.has("ccc3333")).toBe(true)
    expect(state().viewingCommit).toBe("ccc3333")
    expect(state().files.map((file) => file.filename)).toEqual(["b.ts"])
    expect(toast.current()?.message).toBe("Commit 2/4: ccc3333: commit ccc3333")
  })

  test("does not fetch a commit it already has", async () => {
    const { ctx, state, fetched } = selecting(onlyB)
    await handleCommitSelected(ctx, "ccc3333")
    await handleCommitSelected(ctx, null)

    await handleCommitSelected(ctx, "ccc3333")

    expect(fetched).toEqual(["ccc3333"])
    expect(state().viewingCommit).toBe("ccc3333")
  })

  test("shows a failed fetch and leaves the scope as it was", async () => {
    const { ctx, state, commitDiffs, toast } = selecting(async () => {
      throw new Error("Not Found")
    })

    await handleCommitSelected(ctx, "ccc3333")

    expect(toast.current()).toEqual({ message: "Failed to load commit: Not Found", type: "error" })
    expect(state().viewingCommit).toBeNull()
    expect(state().files.map((file) => file.filename)).toEqual(["a.ts", "b.ts"])
    expect(commitDiffs.has("ccc3333")).toBe(false)
  })

  test("goes back to the whole review on null", async () => {
    const { ctx, state, toast } = selecting(onlyB)
    await handleCommitSelected(ctx, "ccc3333")

    await handleCommitSelected(ctx, null)

    expect(state().viewingCommit).toBeNull()
    expect(state().files.map((file) => file.filename)).toEqual(["a.ts", "b.ts"])
    expect(toast.current()?.message).toBe("Viewing all commits")
  })

  test("reveals the file it was asked for from, in the commit's diff", async () => {
    const { ctx, revealed } = selecting(onlyB)

    await handleCommitSelected(ctx, "ccc3333", "b.ts")

    expect(revealed).toEqual([0])
  })
})

describe("a commit read still in flight when the review is replaced", () => {
  test("scopes nothing, keeps nothing and says nothing when it lands", async () => {
    let land!: (diff: string) => void
    const { ctx, state, commitDiffs, toast } = selecting(() => new Promise((resolve) => { land = resolve }))
    const selected = handleCommitSelected(ctx, "ccc3333")
    commitDiffs.clear()
    toast.clear()

    land(patch("b.ts", "two"))
    await selected

    expect(state().viewingCommit).toBeNull()
    expect(state().files.map((file) => file.filename)).toEqual(["a.ts", "b.ts"])
    expect(commitDiffs.has("ccc3333")).toBe(false)
    expect(toast.current()).toBeNull()
  })

  test("shows no error when it fails", async () => {
    let fail!: (error: Error) => void
    const { ctx, state, commitDiffs, toast } = selecting(() => new Promise((_resolve, reject) => { fail = reject }))
    const selected = handleCommitSelected(ctx, "ccc3333")
    commitDiffs.clear()
    toast.clear()

    fail(new Error("Not Found"))
    await selected

    expect(state().viewingCommit).toBeNull()
    expect(toast.current()).toBeNull()
  })
})
