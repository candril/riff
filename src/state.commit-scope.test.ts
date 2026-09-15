import { test, expect, describe } from "bun:test"
import { createInitialState, setFileContent, setViewingCommit, getFileContent, type AppState } from "./state"
import type { DiffFile } from "./utils/diff-parser"

const file: DiffFile = {
  filename: "a.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1,1 +1,2 @@\n const one = 1\n+const two = 2",
}

function readFile(state: AppState): AppState {
  return setFileContent(state, "a.ts", "const one = 1\nconst two = 2", "const one = 1")
}

function withCommit(state: AppState): AppState {
  const cached = { files: [file], fileTree: [] }
  return setViewingCommit(
    { ...state, commitDiffCache: new Map([["abc1234", cached]]) },
    "abc1234"
  )
}

describe("the text riff has read of a file", () => {
  test("is dropped when a commit comes into scope", () => {
    const read = readFile(createInitialState([file], [], "gh:o/r#1", "#1: a PR", null, null, [], "pr", null))
    expect(getFileContent(read, "a.ts")?.newContent).toBe("const one = 1\nconst two = 2")

    expect(getFileContent(withCommit(read), "a.ts")).toBeNull()
  })

  test("is dropped again on the way back to the whole review", () => {
    const scoped = readFile(withCommit(readFile(
      createInitialState([file], [], "gh:o/r#1", "#1: a PR", null, null, [], "pr", null)
    )))
    expect(getFileContent(scoped, "a.ts")).not.toBeNull()

    expect(getFileContent(setViewingCommit(scoped, null), "a.ts")).toBeNull()
  })
})
