import { describe, expect, test } from "bun:test"
import type { PrCheck, PrInfo, PrMergeQueue, PrReview } from "../providers/github/types"
import type { Comment } from "../types"
import { prInfo } from "../testing/pr-info"
import { theme } from "../theme"
import { mergeStatus, type BehindBy } from "./merge-status-model"
import { mergeHeaderSummary, openMergeSummary } from "./merge-status-summary"

const review = (author: string, state: PrReview["state"]): PrReview => ({
  id: `PRR_${author}`,
  author,
  state,
  submittedAt: "2026-01-01T00:00:00Z",
})

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
  id: nextId++,
  name,
  status: "completed",
  conclusion: "success",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  isRequired: true,
  ...over,
})
const failing = (name: string, isRequired = true) => check(name, { conclusion: "failure", isRequired })
const pending = (name: string) => check(name, { status: "in_progress", conclusion: null })

const openThread: Comment = {
  id: "t1",
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: "",
  createdAt: "",
  status: "synced",
  isThreadResolved: false,
}

const summary = (pr: PrInfo, { comments = [] as Comment[], behindBy = 0 as BehindBy } = {}) =>
  mergeHeaderSummary(mergeStatus({ prInfo: pr, comments, behindBy }), pr.checks ?? [])
const plain = (pr: PrInfo, opts?: Parameters<typeof summary>[1]) => summary(pr, opts).map((s) => s.text).join("")

describe("mergeHeaderSummary", () => {
  test("is just the verdict when ready", () => {
    expect(summary(ready({ checks: [check("build")] }))).toEqual([{ text: "✓ ready", fg: theme.green }])
  })

  test("names one failing check in red", () => {
    expect(summary(ready({ checks: [check("build"), failing("lint")] }))).toEqual([
      { text: "✗ blocked", fg: theme.red },
      { text: " · ", fg: theme.subtext0 },
      { text: "lint failing", fg: theme.red },
    ])
  })

  test("names two failing checks, required first, then counts the rest and the pending ones", () => {
    const checks = [failing("docs", false), failing("lint"), failing("e2e"), ...["a", "b", "c", "d"].map(pending)]
    const spans = summary(ready({ checks }))
    expect(spans.map((s) => s.text).join("")).toBe("✗ blocked · lint, e2e failing +1 · ⧗ 4 pending")
    expect(spans.at(-1)).toEqual({ text: "⧗ 4 pending", fg: theme.overlay0 })
  })

  test("takes an optional failing check as a warning, in yellow", () => {
    const spans = summary(ready({ checks: [check("build"), failing("docs", false)] }))
    expect(spans).toEqual([
      { text: "⚠ mergeable with warnings", fg: theme.yellow },
      { text: " · ", fg: theme.subtext0 },
      { text: "docs failing", fg: theme.yellow },
    ])
  })

  test("joins a failing check, an open thread and conflicts in the section's order", () => {
    const pr = ready({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", checks: [failing("lint")] })
    const spans = summary(pr, { comments: [openThread] })
    expect(spans.map((s) => s.text).join("")).toBe("✗ blocked · lint failing · 1 unresolved · conflicts")
    expect(spans.find((s) => s.text === "1 unresolved")?.fg).toBe(theme.yellow)
    expect(spans.find((s) => s.text === "conflicts")?.fg).toBe(theme.red)
  })

  test("names a draft", () => {
    expect(plain(ready({ isDraft: true }))).toBe("✗ blocked · draft")
  })

  test("names the review gate the reviews line fails on", () => {
    expect(plain(ready({ reviewDecision: "CHANGES_REQUESTED", reviews: [review("bob", "CHANGES_REQUESTED")] })))
      .toBe("✗ blocked · changes requested")
    expect(plain(ready({ reviewDecision: "REVIEW_REQUIRED", reviews: [] }))).toBe("✗ blocked · review required")
    expect(plain(ready({ reviewDecision: "REVIEW_REQUIRED", requiredApprovals: 2 }))).toBe("✗ blocked · 1/2 approvals")
  })

  test("names the base it is behind, and branch protection when nothing else explains it", () => {
    expect(plain(ready({ mergeStateStatus: "BEHIND" }), { behindBy: 3 })).toBe("✗ blocked · behind main")
    expect(plain(ready({ mergeStateStatus: "BLOCKED" }))).toBe("✗ blocked · branch protection")
    expect(plain(ready({ mergeStateStatus: "UNKNOWN" }))).toBe("⚠ mergeable with warnings · computing")
  })

  test("leaves an info line out: armed auto-merge is no reason", () => {
    expect(summary(ready({ autoMergeMethod: "SQUASH" }))).toEqual([{ text: "✓ ready", fg: theme.green }])
  })

  test("leaves a compare that failed out: riff not knowing is no reason", () => {
    expect(summary(ready(), { behindBy: "failed" })).toEqual([{ text: "✓ ready", fg: theme.green }])
    expect(plain(ready(), { behindBy: "failed", comments: [openThread] })).toBe("⚠ mergeable with warnings · 1 unresolved")
  })
})

describe("the merge status header with a merge queue", () => {
  const queued = (over: Partial<NonNullable<PrMergeQueue["entry"]>> = {}): PrMergeQueue => ({
    entry: { position: 3, total: 7, state: "AWAITING_CHECKS", etaSeconds: 720, enqueuedAt: null, enqueuer: null, ...over },
    inQueue: true,
    removal: null,
  })
  const statusOf = (pr: PrInfo) => mergeStatus({ prInfo: pr, comments: [], behindBy: 0 })

  test("while queued, folded or open, is the queue's position alone in the queue line's colour", () => {
    const pr = ready({ mergeQueue: queued(), isDraft: true })
    const span = { text: "⧗ queued #3 of 7 · ~12m", fg: theme.blue }
    expect(summary(pr)).toEqual([span])
    expect(openMergeSummary(statusOf(pr))).toEqual([span])
  })

  test("goes green once the entry is mergeable, and leaves out what GitHub did not say", () => {
    expect(summary(ready({ mergeQueue: queued({ state: "MERGEABLE", total: null, etaSeconds: null }) }))).toEqual([
      { text: "⧗ queued #3", fg: theme.green },
    ])
  })

  test("names a removal or an unmergeable entry as what blocks", () => {
    const removed = ready({ mergeQueue: { entry: null, inQueue: false, removal: { reason: "Merge conflicts", at: "2026-03-01T11:00:00Z" } } })
    const spans = summary(removed)
    expect(plain(removed)).toBe("✗ blocked · removed from queue")
    expect(spans.at(-1)?.fg).toBe(theme.red)
    expect(openMergeSummary(statusOf(removed))).toEqual([{ text: "✗ blocked", fg: theme.red }])
    expect(plain(ready({ mergeQueue: queued({ state: "UNMERGEABLE" }) }))).toBe("✗ blocked · unmergeable in queue")
  })

  test("not queued adds nothing", () => {
    const idle: PrMergeQueue = { entry: null, inQueue: false, removal: null }
    expect(summary(ready({ mergeQueue: idle }))).toEqual([{ text: "✓ ready", fg: theme.green }])
    expect(plain(ready({ mergeQueue: idle, isDraft: true }))).toBe("✗ blocked · draft")
  })
})
