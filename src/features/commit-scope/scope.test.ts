import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { DiffFile } from "../../utils/diff-parser"
import { createFileContentState, type FileContentState } from "../file-content/state"
import { createFileFoldsState } from "../folds/file-folds-state"
import { createCommitDiffsState } from "./diffs-state"
import { scopeToCommit } from "./scope"

const file: DiffFile = {
  filename: "a.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n const one = 1\n+const two = 2",
}

function readFile(fileContent: FileContentState): void {
  fileContent.set("a.ts", "const one = 1\nconst two = 2", "const one = 1")
  fileContent.expand("a.ts:start:0")
}

function review(): AppState {
  return createInitialState([file], [], "gh:o/r#1", "#1: a PR", null, null, [], "pr", null)
}

function fetched() {
  const commitDiffs = createCommitDiffsState()
  commitDiffs.put("abc1234", [file])
  return commitDiffs
}

describe("the text riff has read of a file", () => {
  test("is dropped when a commit comes into scope", () => {
    const fileContent = createFileContentState()
    readFile(fileContent)
    expect(fileContent.entry("a.ts")?.newContent).toBe("const one = 1\nconst two = 2")

    const scoped = scopeToCommit(review(), fetched(), fileContent, createFileFoldsState(), "abc1234")

    expect(scoped.viewingCommit).toBe("abc1234")
    expect(fileContent.entry("a.ts")).toBeNull()
    expect(fileContent.isExpanded("a.ts:start:0")).toBe(false)
  })

  test("is dropped again on the way back to the whole review", () => {
    const fileContent = createFileContentState()
    const scoped = scopeToCommit(review(), fetched(), fileContent, createFileFoldsState(), "abc1234")
    readFile(fileContent)
    expect(fileContent.entry("a.ts")).not.toBeNull()

    const whole = scopeToCommit(scoped, fetched(), fileContent, createFileFoldsState(), null)

    expect(whole.viewingCommit).toBeNull()
    expect(fileContent.entry("a.ts")).toBeNull()
    expect(fileContent.isExpanded("a.ts:start:0")).toBe(false)
  })

  test("is kept when the commit's diff is not cached, since nothing switches", () => {
    const fileContent = createFileContentState()
    readFile(fileContent)
    const state = review()

    expect(scopeToCommit(state, fetched(), fileContent, createFileFoldsState(), "not-cached")).toBe(state)
    expect(fileContent.entry("a.ts")).not.toBeNull()
  })

  test("ends the spinner of the divider being fetched, whose read will be dropped", () => {
    const fileContent = createFileContentState()
    fileContent.setExpanding("a.ts:start:0")

    scopeToCommit(review(), fetched(), fileContent, createFileFoldsState(), "abc1234")

    expect(fileContent.expanding()).toBeNull()
  })
})

describe("the folded files", () => {
  test("are dropped when a commit comes into scope", () => {
    const fileFolds = createFileFoldsState()
    fileFolds.collapse(["a.ts"])

    scopeToCommit(review(), fetched(), createFileContentState(), fileFolds, "abc1234")

    expect(fileFolds.collapsed().size).toBe(0)
  })

  test("are dropped again on the way back to the whole review", () => {
    const fileFolds = createFileFoldsState()
    const scoped = scopeToCommit(review(), fetched(), createFileContentState(), fileFolds, "abc1234")
    fileFolds.collapse(["a.ts"])

    scopeToCommit(scoped, fetched(), createFileContentState(), fileFolds, null)

    expect(fileFolds.collapsed().size).toBe(0)
  })

  test("are kept when the commit's diff is not cached, since nothing switches", () => {
    const fileFolds = createFileFoldsState()
    fileFolds.collapse(["a.ts"])

    scopeToCommit(review(), fetched(), createFileContentState(), fileFolds, "not-cached")

    expect(fileFolds.isCollapsed("a.ts")).toBe(true)
  })
})
