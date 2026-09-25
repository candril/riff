import { test, expect, describe } from "bun:test"
import { createViewedStatus, markStaleFiles, mergeGitHubViewedStates } from "./viewed-status"
import type { DiffFile } from "./diff-parser"
import type { FileReviewStatus } from "../types"

const file = (filename: string, content: string): DiffFile => ({
  filename, additions: 1, deletions: 0, status: "modified", content,
})
const statuses = (...list: FileReviewStatus[]) => new Map(list.map((s) => [s.filename, s]))

describe("markStaleFiles", () => {
  test("a file whose patch changed since it was viewed is stale", () => {
    const viewed = createViewedStatus("a.ts", "sha", true, file("a.ts", "+one"))
    const marked = markStaleFiles(statuses(viewed), [file("a.ts", "+one\n+two")])
    expect(marked.get("a.ts")?.isStale).toBe(true)
  })

  test("a file whose patch is unchanged is not", () => {
    const viewed = createViewedStatus("a.ts", "sha", true, file("a.ts", "+one"))
    const marked = markStaleFiles(statuses(viewed), [file("a.ts", "+one")])
    expect(marked.get("a.ts")?.isStale).toBe(false)
  })

  test("without a recorded patch the stored verdict stands", () => {
    const viewed = { filename: "a.ts", viewed: true, isStale: true }
    const marked = markStaleFiles(statuses(viewed), [file("a.ts", "+one")])
    expect(marked.get("a.ts")?.isStale).toBe(true)
  })
})

describe("mergeGitHubViewedStates", () => {
  test("DISMISSED keeps the file viewed and marks it stale", () => {
    const merged = mergeGitHubViewedStates(new Map(), new Map([["a.ts", "DISMISSED"]]), "sha", [file("a.ts", "+one")])
    expect(merged.get("a.ts")).toMatchObject({ viewed: true, isStale: true, githubSynced: true })
  })

  test("VIEWED clears a local stale verdict and vouches for the current patch", () => {
    const local = createViewedStatus("a.ts", "old", true, file("a.ts", "+one"))
    const current = file("a.ts", "+one\n+two")
    const merged = mergeGitHubViewedStates(statuses(local), new Map([["a.ts", "VIEWED"]]), "sha", [current])
    expect(merged.get("a.ts")?.isStale).toBe(false)
    expect(markStaleFiles(merged, [current]).get("a.ts")?.isStale).toBe(false)
  })

  test("UNVIEWED unmarks a file viewed locally", () => {
    const local = createViewedStatus("a.ts", "sha", true, file("a.ts", "+one"))
    const merged = mergeGitHubViewedStates(statuses(local), new Map([["a.ts", "UNVIEWED"]]), "sha", [])
    expect(merged.get("a.ts")?.viewed).toBe(false)
  })
})
