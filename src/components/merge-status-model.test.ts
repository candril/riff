import { test, expect, describe } from "bun:test"
import { mergeStatus, type MergePoint } from "./merge-status-model"
import type { PrCheck, PrInfo, PrReview } from "../providers/github/types"
import type { Comment } from "../types"
import { prInfo } from "../testing/pr-info"

const ready = (over: Partial<PrInfo> = {}): PrInfo =>
  prInfo("", {
    baseRef: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    reviews: [review("alice", "APPROVED")],
    requestedReviewers: [],
    checks: [],
    ...over,
  })

let nextId = 1
const check = (name: string, over: Partial<PrCheck> = {}): PrCheck => ({
  id: nextId++, name, status: "completed", conclusion: "success",
  detailsUrl: null, startedAt: null, completedAt: null, ...over,
})
const failed = (name: string, isRequired?: boolean): PrCheck =>
  check(name, { conclusion: "failure", ...(isRequired === undefined ? {} : { isRequired }) })

function review(author: string, state: PrReview["state"], submittedAt = "2026-01-01T00:00:00Z"): PrReview {
  return { id: `PRR_${author}_${submittedAt}`, author, state, submittedAt }
}
const thread = (resolved: boolean): Comment => ({
  id: `c${nextId++}`, filename: "a.ts", line: 1, side: "RIGHT", body: "", createdAt: "", status: "synced",
  isThreadResolved: resolved,
})

const status = (pr: PrInfo, { comments = [] as Comment[], behindBy = 0 as number | null } = {}) =>
  mergeStatus({ prInfo: pr, comments, behindBy })
const point = (pr: PrInfo, id: MergePoint["id"], opts?: Parameters<typeof status>[1]) =>
  status(pr, opts).points.filter((p) => p.id === id).map(({ state, text }) => ({ state, text }))

describe("the merge verdict", () => {
  test("clean, approved, green and current is ready, with every gate listed", () => {
    expect(status(ready({ checks: [check("build")] }))).toEqual({
      verdict: "ready",
      verdictText: "✓ ready",
      points: [
        { id: "checks", state: "ok", text: "1/1 passed" },
        { id: "reviews", state: "ok", text: "1 approval" },
        { id: "conversations", state: "ok", text: "all resolved" },
        { id: "conflicts", state: "ok", text: "no conflicts" },
        { id: "base", state: "ok", text: "up to date with main" },
        { id: "blockers", state: "ok", text: "none" },
      ],
    })
  })

  test("a warning or a pending gate reads mergeable with warnings", () => {
    expect(status(ready(), { comments: [thread(false)] }).verdictText).toBe("⚠ mergeable with warnings")
    expect(status(ready({ checks: [check("e2e", { status: "in_progress", conclusion: null })] })).verdict).toBe("warnings")
  })

  test("UNSTABLE warns even when every listed gate is fine", () => {
    expect(status(ready({ mergeStateStatus: "UNSTABLE" })).verdict).toBe("warnings")
  })

  test("any failing gate blocks", () => {
    expect(status(ready({ mergeable: "CONFLICTING" }))).toMatchObject({ verdict: "blocked", verdictText: "✗ blocked" })
  })
})

describe("checks", () => {
  test.each([
    ["none at all", [], { state: "ok", text: "no checks" }],
    ["neutral and skipped pass", [check("a"), check("b", { conclusion: "neutral" }), check("c", { conclusion: "skipped" })], { state: "ok", text: "3/3 passed" }],
    ["running", [check("a"), check("b", { status: "queued", conclusion: null })], { state: "pending", text: "1/2 · 1 running" }],
    ["two failing are both named", [check("a"), failed("lint", true), failed("e2e", true)], { state: "fail", text: "1/3 · lint, e2e failing" }],
    ["a third failure is counted", [failed("lint", true), failed("e2e", true), failed("unit", true), check("a")], { state: "fail", text: "1/4 · lint, e2e +1 failing" }],
    ["cancelled fails", [check("a", { conclusion: "cancelled", isRequired: true })], { state: "fail", text: "0/1 · a failing" }],
  ] as [string, PrCheck[], Omit<MergePoint, "id">][])("%s", (_, checks, expected) => {
    expect(point(ready({ checks }), "checks")).toEqual([expected])
  })

  test("required failures are named before optional ones", () => {
    const checks = [failed("docs", false), failed("lint", false), failed("build", true)]
    expect(point(ready({ checks }), "checks")).toEqual([{ state: "fail", text: "0/3 · build, docs +1 failing" }])
  })

  test("only optional failures warn, and say so", () => {
    const checks = [failed("docs", false), check("build", { isRequired: true })]
    expect(point(ready({ checks }), "checks")).toEqual([{ state: "warn", text: "1/2 · docs failing (optional)" }])
    expect(status(ready({ checks })).verdict).toBe("warnings")
  })

  test("with no answer on required, every failure blocks", () => {
    expect(point(ready({ checks: [failed("docs"), check("build")] }), "checks")).toEqual([
      { state: "fail", text: "1/2 · docs failing" },
    ])
  })
})

describe("reviews", () => {
  test("the latest verdict per reviewer counts, and a comment changes nothing", () => {
    const reviews = [
      review("bob", "APPROVED", "2026-01-01"),
      review("bob", "CHANGES_REQUESTED", "2026-01-02"),
      review("carol", "APPROVED", "2026-01-03"),
      review("carol", "COMMENTED", "2026-01-04"),
    ]
    expect(point(ready({ reviews, reviewDecision: "CHANGES_REQUESTED" }), "reviews")).toEqual([
      { state: "fail", text: "1 approval · changes requested by bob" },
    ])
  })

  test("requested reviewers are waited on", () => {
    expect(point(ready({ reviews: [], reviewDecision: "REVIEW_REQUIRED", requestedReviewers: ["x", "y"] }), "reviews")).toEqual([
      { state: "fail", text: "0 approvals · waiting on x, y" },
    ])
  })

  test("a known requirement reads N/M, and too few approvals fail even without a decision", () => {
    expect(point(ready({ requiredApprovals: 2, reviewDecision: null }), "reviews")).toEqual([
      { state: "fail", text: "1/2 approvals" },
    ])
    expect(point(ready({ requiredApprovals: 1 }), "reviews")).toEqual([{ state: "ok", text: "1/1 approval" }])
  })

  test("a null decision with nothing against it is fine", () => {
    expect(point(ready({ reviewDecision: null, reviews: [] }), "reviews")).toEqual([{ state: "ok", text: "0 approvals" }])
  })
})

describe("conversations", () => {
  test("unresolved roots are counted; replies and resolved threads are not", () => {
    const reply: Comment = { ...thread(false), inReplyTo: "c0" }
    expect(point(ready(), "conversations", { comments: [thread(false), thread(true), reply] })).toEqual([
      { state: "warn", text: "1 unresolved" },
    ])
    expect(point(ready(), "conversations", { comments: [thread(false), thread(false)] })).toEqual([
      { state: "warn", text: "2 unresolved" },
    ])
  })
})

describe("conflicts", () => {
  test.each([
    [{ mergeable: "CONFLICTING" }, { state: "fail", text: "conflicting" }],
    [{ mergeable: null, mergeStateStatus: "DIRTY" }, { state: "fail", text: "conflicting" }],
    [{ mergeable: "UNKNOWN" }, { state: "pending", text: "checking" }],
    [{ mergeable: null }, { state: "pending", text: "checking" }],
  ] as [Partial<PrInfo>, Omit<MergePoint, "id">][])("%o", (over, expected) => {
    expect(point(ready(over), "conflicts")).toEqual([expected])
  })
})

describe("base", () => {
  test.each([
    [0, "CLEAN", { state: "ok", text: "up to date with main" }],
    [1, "CLEAN", { state: "warn", text: "1 commit behind main" }],
    [3, "BEHIND", { state: "fail", text: "3 commits behind main" }],
    [null, "BEHIND", { state: "fail", text: "behind main" }],
    [null, "CLEAN", { state: "pending", text: "comparing with main" }],
  ] as [number | null, PrInfo["mergeStateStatus"], Omit<MergePoint, "id">][])("%p behind, %s", (behindBy, mergeStateStatus, expected) => {
    expect(point(ready({ mergeStateStatus }), "base", { behindBy })).toEqual([expected])
  })
})

describe("other blockers", () => {
  test("a draft blocks", () => {
    expect(point(ready({ isDraft: true }), "blockers")).toEqual([{ state: "fail", text: "draft" }])
  })

  test("BLOCKED with nothing more specific blames branch protection", () => {
    expect(point(ready({ mergeStateStatus: "BLOCKED" }), "blockers")).toEqual([
      { state: "fail", text: "blocked by branch protection" },
    ])
  })

  test("a failing required check, a failing review or an open thread explains BLOCKED instead", () => {
    const blocked = ready({ mergeStateStatus: "BLOCKED" })
    expect(point({ ...blocked, checks: [failed("build", true)] }, "blockers")).toEqual([{ state: "ok", text: "none" }])
    expect(point({ ...blocked, checks: [check("build", { status: "in_progress", conclusion: null, isRequired: true })] }, "blockers"))
      .toEqual([{ state: "ok", text: "none" }])
    expect(point({ ...blocked, reviewDecision: "REVIEW_REQUIRED" }, "blockers")).toEqual([{ state: "ok", text: "none" }])
    expect(point(blocked, "blockers", { comments: [thread(false)] })).toEqual([{ state: "ok", text: "none" }])
  })

  test("an optional failure does not explain BLOCKED", () => {
    const pr = ready({ mergeStateStatus: "BLOCKED", checks: [failed("docs", false), check("build", { isRequired: true })] })
    expect(point(pr, "blockers")).toEqual([{ state: "fail", text: "blocked by branch protection" }])
  })

  test("UNKNOWN is GitHub still at work", () => {
    expect(point(ready({ mergeStateStatus: "UNKNOWN" }), "blockers")).toEqual([
      { state: "pending", text: "GitHub is still computing the merge state" },
    ])
  })

  test("armed auto-merge is information, not a warning", () => {
    const result = status(ready({ autoMergeMethod: "squash" }))
    expect(result.points.filter((p) => p.id === "blockers")).toEqual([
      { id: "blockers", state: "info", text: "auto-merge armed (squash)" },
    ])
    expect(result.verdict).toBe("ready")
  })

  test("several blockers come in order", () => {
    expect(point(ready({ isDraft: true, mergeStateStatus: "UNKNOWN", autoMergeMethod: "merge" }), "blockers").map((p) => p.text))
      .toEqual(["draft", "GitHub is still computing the merge state", "auto-merge armed (merge)"])
  })
})
