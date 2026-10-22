import { describe, expect, test } from "bun:test"
import type { PrCheck } from "../providers/github/types"
import { ago, checks, commits, conversationComments, prInfo, previews, reviews, reviewThreadComments } from "../testing/pr-info"
import type { Comment } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import {
  conversationItems,
  flatCheckItems,
  flatConversationItemId,
  flatConversationItems,
  visibleCommits,
  visibleFiles,
  visiblePreviews,
  visibleRows,
  type ConversationItem,
  type FlatCheckItem,
} from "./pr-info-items"
import type { MergePoint } from "./merge-status-model"

const NONE: ReadonlySet<string> = new Set()

const fullInfo = (extra = {}) =>
  prInfo("Body", { reviews: reviews(), conversationComments: conversationComments(), ...extra })

const ids = (items: ConversationItem[]) =>
  items.map((item) => (item.type === "pending-reviewer" ? `pending:${item.data.join(",")}` : String(item.data.id)))

describe("conversationItems", () => {
  test("lists comments and reviews oldest first, pending reviewers last", () => {
    const items = conversationItems(
      fullInfo({ requestedReviewers: ["frank", "gina"] }),
      reviewThreadComments(),
      NONE
    )
    expect(ids(items)).toEqual([
      "501",
      "PRR_alice",
      "PRR_bob1",
      "PRR_erin",
      "PRR_bob2",
      "PRR_carol",
      "502",
      "pending:frank,gina",
    ])
  })

  test("does not count a requested reviewer who already reviewed as pending", () => {
    const items = conversationItems(fullInfo({ requestedReviewers: ["bob", "frank"] }), [], NONE)
    expect(items[items.length - 1]).toEqual({ type: "pending-reviewer", data: ["frank"] })
  })

  test("leaves no pending row when every requested reviewer reviewed", () => {
    const items = conversationItems(fullInfo({ requestedReviewers: ["alice"] }), [], NONE)
    expect(items.some((item) => item.type === "pending-reviewer")).toBe(false)
  })

  test("skips a COMMENTED review with neither a body nor threads", () => {
    const info = prInfo("", {
      reviews: [{ id: "PRR_empty", databaseId: 200, author: "hal", state: "COMMENTED", submittedAt: ago(10) }],
    })
    expect(conversationItems(info, [], NONE)).toEqual([])
  })

  test("hangs a thread whose review is unknown on an orphan review of its own", () => {
    const stray: Comment = {
      id: "s1",
      filename: "src/x.ts",
      line: 1,
      side: "RIGHT",
      body: "Stray",
      author: "ivy",
      createdAt: ago(5),
      status: "synced",
      githubReviewId: 999,
    }
    const items = conversationItems(prInfo(""), [stray], NONE)
    expect(items).toHaveLength(1)
    const review = items[0]!
    expect(review.type).toBe("review")
    if (review.type !== "review") return
    expect(review.data.id).toBe("orphan-s1")
    expect(review.data.author).toBe("ivy")
    expect(review.data.state).toBe("COMMENTED")
    expect(review.data.threads.map((thread) => thread.body)).toEqual(["Stray"])
  })

  test("sorts replies under their root, oldest first", () => {
    const [root, early, late] = reviewThreadComments()
    const items = conversationItems(fullInfo(), [late!, root!, early!], NONE)
    const bob = items.find((item) => item.type === "review" && item.data.id === "PRR_bob2")
    if (bob?.type !== "review") throw new Error("no review from bob")
    expect(bob.data.threads).toHaveLength(1)
    expect(bob.data.threads[0]!.replies.map((reply) => reply.id)).toEqual(["t1r1", "t1r2"])
  })

  test("drops a PR comment whose id is hidden", () => {
    const items = conversationItems(fullInfo(), [], new Set(["502"]))
    expect(ids(items)).not.toContain("502")
    expect(ids(items)).toContain("501")
  })
})

describe("flatConversationItems", () => {
  const items = () => conversationItems(fullInfo(), reviewThreadComments(), NONE)
  const flatIds = (flat: ReturnType<typeof flatConversationItems>) => flat.map(flatConversationItemId)

  test("gives a collapsed review its header only", () => {
    expect(flatIds(flatConversationItems(items(), "", NONE))).toEqual([
      "501",
      "PRR_alice",
      "PRR_bob1",
      "PRR_erin",
      "PRR_bob2",
      "PRR_carol",
      "502",
    ])
  })

  test("gives an expanded review its header and then its threads", () => {
    const flat = flatConversationItems(items(), "", new Set(["PRR_bob2"]))
    expect(flatIds(flat).slice(4, 8)).toEqual(["PRR_bob2", "t1", "t2", "t3"])
    expect(flat.map((item) => item.type).slice(4, 8)).toEqual([
      "review-header",
      "review-thread",
      "review-thread",
      "review-thread",
    ])
  })

  test("a filter on a filename keeps the review and only the matching thread, though collapsed", () => {
    const flat = flatConversationItems(items(), "farewell", NONE)
    expect(flatIds(flat)).toEqual(["PRR_bob2", "t2"])
  })
})

describe("flatCheckItems", () => {
  const row = (item: FlatCheckItem) => {
    switch (item.kind) {
      case "point":
        return `[${item.point.id}]`
      case "check":
        return item.check.name
      case "annotation":
        return `${item.check.name}: ${item.annotation.message.split("\n")[0]}`
      case "placeholder":
        return `${item.check.name}: <${item.placeholder}>`
    }
  }
  const byName = (name: string) => checks().find((check) => check.name === name)!
  const CHECKS: MergePoint = { id: "checks", state: "fail", text: "1/6 · test, e2e +2 failing" }
  const POINTS: MergePoint[] = [
    CHECKS,
    { id: "reviews", state: "ok", text: "2/2 approvals" },
    { id: "base", state: "warn", text: "3 commits behind main" },
  ]
  const OPEN = new Set(["checks"] as const)
  const items = (
    list: PrCheck[] | undefined,
    { expanded = new Set<number>(), points = [CHECKS], open = OPEN as ReadonlySet<MergePoint["id"]>, filter = "" } = {}
  ) => flatCheckItems(points, list, { expandedCheckIds: expanded, expandedPoints: open, filter }).map(row)

  test("gives each gate a row, in the model's order, and nothing under a folded checks line", () => {
    expect(items(checks(), { points: POINTS, open: new Set() })).toEqual(["[checks]", "[reviews]", "[base]"])
  })

  test("lists the checks under the open checks line, before the next gate", () => {
    expect(items(checks(), { points: POINTS })).toEqual([
      "[checks]", "build", "lint", "test", "e2e", "deploy", "audit", "[reviews]", "[base]",
    ])
  })

  test("gives a collapsed failing check one row", () => {
    expect(items([byName("test")])).toEqual(["[checks]", "test"])
  })

  test("follows an expanded failing check with its annotations, or a placeholder for where they are", () => {
    expect(items(checks(), { expanded: new Set([3, 4, 5, 6]) })).toEqual([
      "[checks]",
      "build",
      "lint",
      "test",
      "test: Expected 2, got 3",
      "test: Unused export",
      "e2e",
      "e2e: <loading>",
      "deploy",
      "deploy: <error>",
      "audit",
      "audit: <empty>",
    ])
  })

  test("adds nothing under an expanded check that has not failed", () => {
    expect(items(checks(), { expanded: new Set([1, 2]) })).toEqual([
      "[checks]",
      "build",
      "lint",
      "test",
      "e2e",
      "deploy",
      "audit",
    ])
  })

  test("adds nothing under an expanded failing check whose annotations were never asked for", () => {
    const idle: PrCheck = { ...byName("test"), annotations: undefined, annotationsStatus: undefined }
    expect(items([idle], { expanded: new Set([3]) })).toEqual(["[checks]", "test"])
  })

  test("a filter on a check's name keeps the checks line, opened, with only the checks that match", () => {
    expect(items(checks(), { points: POINTS, open: new Set(), filter: "e2e" })).toEqual(["[checks]", "e2e"])
  })

  test("a filter keeps a gate whose label or text matches", () => {
    expect(items(checks(), { points: POINTS, filter: "behind" })).toEqual(["[base]"])
    expect(items(checks(), { points: POINTS, filter: "review" })).toEqual(["[reviews]"])
  })

  test("lists only the checks line without checks", () => {
    expect(items(undefined, { points: [{ id: "checks", state: "ok", text: "no checks" }] })).toEqual(["[checks]"])
  })
})

describe("visible rows", () => {
  const files: DiffFile[] = [
    { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
    { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
  ]

  test("are the very same arrays when there is no filter", () => {
    const rows = previews().rows
    const list = commits(3)
    expect(visibleFiles(files, "")).toBe(files)
    expect(visiblePreviews(rows, "")).toBe(rows)
    expect(visibleCommits(list, "")).toBe(list)
  })

  test("files match on their name, ignoring case", () => {
    expect(visibleFiles(files, "GREET").map((file) => file.filename)).toEqual(["src/greet.ts"])
  })

  test("previews match on the app, the status or a link's label", () => {
    const rows = previews().rows
    expect(visiblePreviews(rows, "admin").map((row) => row.app)).toEqual(["admin"])
    expect(visiblePreviews(rows, "on demand").map((row) => row.app)).toEqual(["admin"])
    expect(visiblePreviews(rows, "storybook").map((row) => row.app)).toEqual(["web"])
  })

  test("commits match on the message, the sha or the author", () => {
    const list = commits(3)
    expect(visibleCommits(list, "step 2").map((commit) => commit.sha)).toEqual(["c02abcdef0123"])
    expect(visibleCommits(list, "c01").map((commit) => commit.message)).toEqual(["fix: step 1"])
    expect(visibleCommits(list, "someone")).toHaveLength(3)
  })
  test("of a whole PR are the files, previews and commits the one filter leaves, with no previews at all read as none", () => {
    const info = prInfo("", { commits: commits(3) })
    const rows = visibleRows({ prInfo: info, files, previews: previews() }, "step 2")
    expect(rows.files).toEqual([])
    expect(rows.previews).toEqual([])
    expect(rows.commits.map((commit) => commit.sha)).toEqual(["c02abcdef0123"])
    expect(visibleRows({ prInfo: info, files, previews: null }, "greet")).toEqual({
      files: [files[0]!],
      previews: [],
      commits: [],
    })
  })
})
