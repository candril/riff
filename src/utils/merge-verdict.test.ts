import { test, expect, describe } from "bun:test"
import { mergeReading } from "./merge-verdict"
import type { PrCheck } from "../providers/github"
import type { Comment } from "../types"

const pr = (over: Partial<Parameters<typeof mergeReading>[0]> = {}) => ({
  isDraft: false,
  mergeStateStatus: "BLOCKED" as const,
  reviewDecision: null,
  autoMergeMethod: null,
  baseRef: "main",
  ...over,
})
const check = (conclusion: PrCheck["conclusion"], status: PrCheck["status"] = "completed"): PrCheck => ({
  id: 1, name: "ci", status, conclusion, detailsUrl: null, startedAt: null, completedAt: null,
})
const thread = (resolved: boolean): Comment => ({
  id: "c", filename: "a.ts", line: 1, side: "RIGHT", body: "", createdAt: "", status: "synced",
  isThreadResolved: resolved,
})

describe("whose move it is", () => {
  test("a draft is nobody's — nothing GitHub says about one is trustworthy", () => {
    expect(mergeReading(pr({ isDraft: true, mergeStateStatus: "CLEAN" }), [], []).verdict).toBe("draft")
  })

  test("armed auto-merge lands by itself", () => {
    expect(mergeReading(pr({ autoMergeMethod: "squash" }), [], []).text).toBe("auto-merge (squash)")
  })

  test("an open thread is the author's move before any merge-state reading", () => {
    const reading = mergeReading(pr({ mergeStateStatus: "CLEAN" }), [], [thread(false), thread(true)])
    expect(reading).toEqual({ verdict: "author", text: "1 open thread" })
  })

  test("clean, hooks and unstable are all mergeable", () => {
    for (const state of ["CLEAN", "HAS_HOOKS", "UNSTABLE"] as const) {
      expect(mergeReading(pr({ mergeStateStatus: state }), [check("failure")], []).text).toBe("mergeable")
    }
  })

  test("what only the author can clear", () => {
    expect(mergeReading(pr({ mergeStateStatus: "DIRTY" }), [], []).text).toBe("conflicts")
    expect(mergeReading(pr({ mergeStateStatus: "BEHIND" }), [], []).text).toBe("behind main")
    expect(mergeReading(pr({ reviewDecision: "CHANGES_REQUESTED" }), [], []).text).toBe("changes requested")
    expect(mergeReading(pr(), [check("failure")], []).text).toBe("checks failing")
  })

  test("a review outranks running checks", () => {
    expect(mergeReading(pr({ reviewDecision: "REVIEW_REQUIRED" }), [check(null, "in_progress")], []).text).toBe("needs review")
    expect(mergeReading(pr(), [check(null, "in_progress")], []).text).toBe("checks running")
  })

  test("nothing outstanding from a human is the machine's", () => {
    expect(mergeReading(pr({ mergeStateStatus: "UNKNOWN" }), [check("success")], []).verdict).toBe("machine")
    expect(mergeReading(pr(), [], []).text).toBe("waiting for GitHub")
  })

  test("blocked, reviewed and green is someone's unnamed gate", () => {
    expect(mergeReading(pr({ reviewDecision: "APPROVED" }), [check("success")], []).text).toBe("blocked")
  })
})
