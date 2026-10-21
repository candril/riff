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

const check = (databaseId: number | undefined, status: string | null, conclusion: string | null) => ({
  databaseId,
  name: `check ${databaseId}`,
  status,
  conclusion,
  detailsUrl: "",
  startedAt: null,
  completedAt: null,
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
})
