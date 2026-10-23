import { describe, expect, test } from "bun:test"
import type { DiffFile } from "../../utils/diff-parser"
import { createCommitDiffsState } from "./diffs-state"
import { commitScopeKey } from "./key"

const file: DiffFile = {
  filename: "src/a.ts",
  additions: 1,
  deletions: 0,
  status: "modified",
  content: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,2 @@\n one\n+two",
}

describe("createCommitDiffsState", () => {
  test("starts with nothing fetched", () => {
    const diffs = createCommitDiffsState()
    expect(diffs.has("abc1234")).toBe(false)
    expect(diffs.entry("abc1234")).toBeNull()
  })

  test("put keeps a scope's files with the tree built from them", () => {
    const diffs = createCommitDiffsState()
    diffs.put("abc1234", [file])
    expect(diffs.has("abc1234")).toBe(true)
    expect(diffs.entry("abc1234")?.files).toEqual([file])
    expect(diffs.entry("abc1234")?.fileTree.map((node) => node.name)).toEqual(["src"])
    expect(diffs.has("def5678")).toBe(false)
  })

  test("clear empties it", () => {
    const diffs = createCommitDiffsState()
    diffs.put("abc1234", [file])
    diffs.put("def5678", [])
    diffs.clear()
    expect(diffs.has("abc1234")).toBe(false)
    expect(diffs.entry("def5678")).toBeNull()
  })

  test("a run is kept apart from the single commit it ends on", () => {
    const diffs = createCommitDiffsState()
    diffs.put(commitScopeKey("bbb2222", ["bbb2222", "aaa1111"]), [file])
    expect(diffs.has(commitScopeKey("bbb2222"))).toBe(false)
    expect(diffs.has(commitScopeKey("bbb2222", ["bbb2222"]))).toBe(false)
    expect(diffs.has(commitScopeKey("bbb2222", ["bbb2222", "aaa1111"]))).toBe(true)
  })

  test("generation starts at 0 and only clear moves it", () => {
    const diffs = createCommitDiffsState()
    expect(diffs.generation()).toBe(0)
    diffs.put("abc1234", [file])
    expect(diffs.generation()).toBe(0)
    diffs.clear()
    expect(diffs.generation()).toBe(1)
  })
})
