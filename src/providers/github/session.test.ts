import { test, expect, describe } from "bun:test"
import { prInfoOf } from "./session"

const commit = (oid: string, authors: unknown[]) => ({
  commit: {
    oid,
    messageHeadline: `commit ${oid}`,
    committedDate: "2026-01-01T00:00:00Z",
    authors: { nodes: authors },
  },
})

const check = (
  databaseId: number | undefined,
  status: string | null,
  conclusion: string | null,
  over: Record<string, unknown> = {},
) => ({
  databaseId,
  name: `check ${databaseId}`,
  status,
  conclusion,
  detailsUrl: "",
  startedAt: null,
  completedAt: null,
  ...over,
})

const rollup = (nodes: unknown[]) => ({
  headCommit: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes } } } }] },
})

const rule = (requiredApprovingReviewCount?: number) => ({
  parameters: requiredApprovingReviewCount === undefined ? {} : { requiredApprovingReviewCount },
})

const pr = (over: Record<string, unknown> = {}) => ({
  number: 7,
  title: "A PR",
  body: null,
  state: "OPEN",
  isDraft: false,
  url: "https://github.com/o/r/pull/7",
  additions: 1,
  deletions: 2,
  changedFiles: 3,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
  headRefName: "feature",
  baseRefName: "main",
  autoMergeRequest: null,
  author: { login: "octo", __typename: "User" },
  reactionGroups: [],
  ...over,
})

describe("reading a PR out of the GraphQL bundle", () => {
  test("commits come newest-first with a short sha and an author fallback", () => {
    const info = prInfoOf(
      pr({
        commits: {
          nodes: [
            commit("1111111aaaa", [{ user: { login: "alice" }, name: "Alice" }]),
            commit("2222222bbbb", [{ user: null, name: "Bob" }]),
            commit("3333333cccc", []),
          ],
        },
      }),
      "o",
      "r",
    )
    expect(info.commits!.map((c) => [c.sha, c.author])).toEqual([
      ["3333333", "unknown"],
      ["2222222", "Bob"],
      ["1111111", "alice"],
    ])
  })

  test("a bot's bare GraphQL login gains the [bot] suffix exactly once", () => {
    const info = prInfoOf(
      pr({
        author: { login: "dependabot", __typename: "Bot" },
        reviews: {
          nodes: [
            { id: "R1", state: "COMMENTED", author: { login: "renovate[bot]", __typename: "Bot" }, reactionGroups: [] },
          ],
        },
      }),
      "o",
      "r",
    )
    expect(info.author).toBe("dependabot[bot]")
    expect(info.reviews!.map((r) => r.author)).toEqual(["renovate[bot]"])
  })

  test("an unresolvable reviewer is dropped and a team reads its name", () => {
    const info = prInfoOf(
      pr({
        reviewRequests: {
          nodes: [
            { requestedReviewer: null },
            { requestedReviewer: { __typename: "Team", name: "core" } },
            { requestedReviewer: { __typename: "Bot", login: "copilot" } },
            { requestedReviewer: { __typename: "User", login: "alice" } },
          ],
        },
      }),
      "o",
      "r",
    )
    expect(info.requestedReviewers).toEqual(["core", "copilot[bot]", "alice"])
  })

  test("a conversation comment by a bot is marked as one", () => {
    const info = prInfoOf(
      pr({
        comments: {
          nodes: [
            { databaseId: 1, body: "hi", author: { login: "github-actions", __typename: "Bot" }, reactionGroups: [] },
            { databaseId: 2, body: "yo", author: { login: "alice", __typename: "User" }, reactionGroups: [] },
          ],
        },
      }),
      "o",
      "r",
    )
    expect(info.conversationComments!.map((c) => [c.author, c.isBot])).toEqual([
      ["github-actions[bot]", true],
      ["alice", false],
    ])
  })

  test("checks drop legacy statuses, sort newest-first and speak the REST vocabulary", () => {
    const info = prInfoOf(
      pr({
        headCommit: {
          nodes: [
            {
              commit: {
                statusCheckRollup: {
                  contexts: {
                    nodes: [
                      check(undefined, "COMPLETED", "SUCCESS"),
                      check(1, "COMPLETED", "STARTUP_FAILURE"),
                      check(4, "IN_PROGRESS", null),
                      check(2, "PENDING", "STALE"),
                      check(3, "COMPLETED", "SUCCESS"),
                    ],
                  },
                },
              },
            },
          ],
        },
      }),
      "o",
      "r",
    )
    expect(info.checks!.map((c) => [c.id, c.status, c.conclusion])).toEqual([
      [4, "in_progress", null],
      [3, "completed", "success"],
      [2, "queued", "neutral"],
      [1, "completed", "failure"],
    ])
  })

  test("state, body and auto-merge are normalised", () => {
    const plain = prInfoOf(pr(), "o", "r")
    expect(plain.state).toBe("open")
    expect(plain.body).toBe("")
    expect(plain.autoMergeMethod).toBeNull()

    const squash = prInfoOf(pr({ autoMergeRequest: { mergeMethod: "SQUASH" } }), "o", "r")
    expect(squash.autoMergeMethod).toBe("squash")
  })

  test("a check says whether it is required only when GitHub answered", () => {
    const info = prInfoOf(
      pr(rollup([
        check(3, "COMPLETED", "SUCCESS", { isRequired: true }),
        check(2, "COMPLETED", "SUCCESS", { isRequired: false }),
        check(1, "COMPLETED", "SUCCESS"),
      ])),
      "o",
      "r",
    )
    expect(info.checks!.map((c) => [c.id, c.isRequired])).toEqual([
      [3, true],
      [2, false],
      [1, undefined],
    ])
    expect("isRequired" in info.checks![2]!).toBe(false)
  })

  test("the repository's merge settings come in GitHub's button order, and only when the repository node is passed", () => {
    const repository = {
      mergeCommitAllowed: true,
      squashMergeAllowed: true,
      rebaseMergeAllowed: false,
      viewerDefaultMergeMethod: "MERGE",
      deleteBranchOnMerge: true,
    }
    const info = prInfoOf(pr({ viewerCanMergeAsAdmin: true }), "o", "r", repository)
    expect(info.mergeMethods).toEqual(["squash", "merge"])
    expect(info.defaultMergeMethod).toBe("merge")
    expect(info.deleteBranchOnMerge).toBe(true)
    expect(info.viewerCanMergeAsAdmin).toBe(true)

    const none = prInfoOf(pr(), "o", "r", { viewerDefaultMergeMethod: null })
    expect(none.mergeMethods).toEqual([])
    expect(none.defaultMergeMethod).toBeNull()
    expect(none.deleteBranchOnMerge).toBe(false)

    const bare = prInfoOf(pr(), "o", "r")
    for (const key of ["mergeMethods", "defaultMergeMethod", "deleteBranchOnMerge", "viewerCanMergeAsAdmin"]) {
      expect(key in bare).toBe(false)
    }
  })

  test("mergeable passes through, and is null where the query did not ask", () => {
    expect(prInfoOf(pr({ mergeable: "CONFLICTING" }), "o", "r").mergeable).toBe("CONFLICTING")
    expect(prInfoOf(pr(), "o", "r").mergeable).toBeNull()
  })

  test("required approvals are the strictest of branch protection and the rulesets", () => {
    const approvals = (baseRef: unknown) => prInfoOf(pr({ baseRef }), "o", "r").requiredApprovals
    expect(approvals({ branchProtectionRule: { requiredApprovingReviewCount: 2 }, rules: { nodes: [rule(1)] } })).toBe(2)
    expect(approvals({ branchProtectionRule: null, rules: { nodes: [rule(), rule(1), rule(0)] } })).toBe(1)
    expect(approvals({ branchProtectionRule: { requiredApprovingReviewCount: 0 }, rules: { nodes: [] } })).toBe(0)
    expect(approvals({ branchProtectionRule: null, rules: { nodes: [rule()] } })).toBeNull()
    expect(approvals(null)).toBeNull()
  })
})

describe("reading the merge queue", () => {
  const timeline = (...nodes: unknown[]) => ({ timelineItems: { nodes } })
  const removal = { __typename: "RemovedFromMergeQueueEvent", reason: "Merge conflicts", createdAt: "2026-01-02T00:00:00Z" }
  const queue = (over: Record<string, unknown> = {}) =>
    pr({ isMergeQueueEnabled: true, isInMergeQueue: false, mergeQueue: { entries: { totalCount: 4 } }, mergeQueueEntry: null, ...over })

  test("is null when the base has no queue, or the PR is no longer open", () => {
    expect(prInfoOf(pr(), "o", "r").mergeQueue).toBeNull()
    expect(prInfoOf(pr({ isMergeQueueEnabled: false, mergeQueue: null }), "o", "r").mergeQueue).toBeNull()
    expect(prInfoOf(queue({ state: "MERGED", ...timeline(removal) }), "o", "r").mergeQueue).toBeNull()
  })

  test("reads a queued entry, with the queue's length as its total", () => {
    const info = prInfoOf(
      queue({
        isInMergeQueue: true,
        mergeQueueEntry: {
          position: 2,
          state: "AWAITING_CHECKS",
          estimatedTimeToMerge: 600,
          enqueuedAt: "2026-01-02T00:00:00Z",
          enqueuer: { login: "alice" },
        },
        ...timeline({ __typename: "AddedToMergeQueueEvent" }),
      }),
      "o",
      "r",
    )
    expect(info.mergeQueue).toEqual({
      entry: {
        position: 2,
        total: 4,
        state: "AWAITING_CHECKS",
        etaSeconds: 600,
        enqueuedAt: "2026-01-02T00:00:00Z",
        enqueuer: "alice",
      },
      inQueue: true,
      removal: null,
    })
  })

  test("leaves the total, eta and enqueuer null when GitHub does not say", () => {
    const info = prInfoOf(
      queue({
        isInMergeQueue: true,
        mergeQueue: null,
        mergeQueueEntry: { position: 1, state: "QUEUED", estimatedTimeToMerge: null, enqueuedAt: null, enqueuer: null },
      }),
      "o",
      "r",
    )
    expect(info.mergeQueue?.entry).toEqual({
      position: 1, total: null, state: "QUEUED", etaSeconds: null, enqueuedAt: null, enqueuer: null,
    })
  })

  test("reads a removal while it is the latest queue event and the PR is out of the queue", () => {
    expect(prInfoOf(queue(timeline(removal)), "o", "r").mergeQueue).toEqual({
      entry: null,
      inQueue: false,
      removal: { reason: "Merge conflicts", at: "2026-01-02T00:00:00Z" },
    })
  })

  test("reads a PR GitHub reports queued without an entry as queued, never removed", () => {
    expect(
      prInfoOf(queue({ isInMergeQueue: true, mergeQueueEntry: null, ...timeline(removal) }), "o", "r").mergeQueue
    ).toEqual({ entry: null, inQueue: true, removal: null })
  })

  test("added but not yet entered is neither queued nor removed", () => {
    expect(prInfoOf(queue(timeline({ __typename: "AddedToMergeQueueEvent" })), "o", "r").mergeQueue).toEqual({
      entry: null,
      inQueue: false,
      removal: null,
    })
    expect(prInfoOf(queue(), "o", "r").mergeQueue).toEqual({ entry: null, inQueue: false, removal: null })
  })
})
