import { describe, expect, test } from "bun:test"
import type { Comment } from "../../types"
import type { ReactionSummary } from "../../types"
import { createInitialState, type AppState } from "../../state"
import { prInfo } from "../../testing/pr-info"
import { focusHandler } from "./focus"
import { applyThreadStates, mergeComments, startCommentPoll, type CommentPollCalls } from "./poll"

function comment(overrides: Partial<Comment> & { id: string }): Comment {
  return {
    filename: "a.ts",
    line: 1,
    side: "RIGHT",
    body: "body",
    createdAt: "2026-01-01T00:00:00Z",
    status: "synced",
    ...overrides,
  }
}

const thumbsUp: ReactionSummary[] = [
  { content: "+1", count: 2, viewerHasReacted: true },
]

describe("mergeComments", () => {
  test("keeps local drafts that GitHub doesn't know about", () => {
    const local = comment({ id: "draft", status: "local" })
    const merged = mergeComments([local], [comment({ id: "gh-1", githubId: 1 })])
    expect(merged.map((c) => c.id)).toEqual(["draft", "gh-1"])
  })

  test("drops a local comment once GitHub reports the same githubId", () => {
    const synced = comment({ id: "was-local", githubId: 7 })
    const merged = mergeComments([synced], [comment({ id: "gh-7", githubId: 7 })])
    expect(merged.map((c) => c.id)).toEqual(["gh-7"])
  })

  test("carries reactions over when probe depth returned none", () => {
    const existing = comment({ id: "gh-1", githubId: 1, reactions: thumbsUp })
    const fetched = comment({ id: "gh-1", githubId: 1, reactions: [] })
    expect(mergeComments([existing], [fetched])[0]!.reactions).toEqual(thumbsUp)
  })

  test("lets a fresh reaction list win over the carried-over one", () => {
    const existing = comment({ id: "gh-1", githubId: 1, reactions: thumbsUp })
    const fresh: ReactionSummary[] = [{ content: "heart", count: 1, viewerHasReacted: false }]
    const fetched = comment({ id: "gh-1", githubId: 1, reactions: fresh })
    expect(mergeComments([existing], [fetched])[0]!.reactions).toEqual(fresh)
  })

  test("a brand-new comment stays reaction-free", () => {
    const merged = mergeComments(
      [comment({ id: "gh-1", githubId: 1, reactions: thumbsUp })],
      [comment({ id: "gh-2", githubId: 2, reactions: [] })],
    )
    expect(merged.find((c) => c.githubId === 2)!.reactions).toEqual([])
  })

  test("sorts by creation time", () => {
    const merged = mergeComments([], [
      comment({ id: "b", githubId: 2, createdAt: "2026-02-01T00:00:00Z" }),
      comment({ id: "a", githubId: 1, createdAt: "2026-01-01T00:00:00Z" }),
    ])
    expect(merged.map((c) => c.id)).toEqual(["a", "b"])
  })
})

describe("applyThreadStates", () => {
  test("patches resolution and outdated onto the matching root", () => {
    const comments = [comment({ id: "gh-1", githubId: 1, isThreadResolved: false })]
    const next = applyThreadStates(comments, [
      { rootCommentId: 1, isResolved: true, isOutdated: true },
    ])
    expect(next[0]!.isThreadResolved).toBe(true)
    expect(next[0]!.outdated).toBe(true)
  })

  test("returns the same array when nothing moved, so the render is skipped", () => {
    const comments = [
      comment({ id: "gh-1", githubId: 1, isThreadResolved: true, outdated: false }),
    ]
    const next = applyThreadStates(comments, [
      { rootCommentId: 1, isResolved: true, isOutdated: false },
    ])
    expect(next).toBe(comments)
  })

  test("leaves comments alone when no thread state matches", () => {
    const comments = [comment({ id: "gh-9", githubId: 9, isThreadResolved: false })]
    expect(applyThreadStates(comments, [
      { rootCommentId: 1, isResolved: true, isOutdated: false },
    ])).toBe(comments)
  })

  test("an empty state list is a no-op — a failed query must not unresolve threads", () => {
    const comments = [comment({ id: "gh-1", githubId: 1, isThreadResolved: true })]
    expect(applyThreadStates(comments, [])).toBe(comments)
  })
})

describe("startCommentPoll", () => {
  const branchPr = prInfo("", { owner: "o", repo: "r", number: 7 })

  function polling(
    initial: AppState,
    timing: { intervalSeconds: number; onFocus?: boolean } = { intervalSeconds: 0 },
    overrides: Partial<CommentPollCalls> = {},
  ) {
    let state = initial
    let stamps = 0
    let markStamped!: () => void
    // A tick's last step on success, so awaiting it waits out the whole tick chain.
    const stamped = new Promise<void>((resolve) => {
      markStamped = resolve
    })
    let headSha = "head-1"
    const asked: string[] = []
    const calls: CommentPollCalls = {
      reviewCommentsChanged: async (owner, repo, number) => {
        asked.push(`probe ${owner}/${repo}#${number}`)
        return { status: "changed", data: [] }
      },
      fetchPrReviewComments: async (owner, repo, number, sha) => {
        asked.push(`comments ${owner}/${repo}#${number} at ${sha}`)
        return []
      },
      getPrThreadStates: async () => [],
      ...overrides,
    }
    const poll = startCommentPoll(
      {
        getState: () => state,
        setState: (fn) => {
          state = fn(state)
        },
        render: () => {},
        prCommentInputOpen: () => false,
        ...timing,
        recreatePrInfoPanel: () => {},
        getHeadSha: () => headSha,
        lastRefresh: {
          stamp: () => {
            stamps++
            markStamped()
          },
        },
      },
      calls,
    )
    return {
      poll,
      asked,
      stamped,
      stamps: () => stamps,
      setState: (next: AppState) => {
        state = next
      },
      state: () => state,
      setHeadSha: (sha: string) => {
        headSha = sha
      },
    }
  }

  test("a local review polls nothing, and starts polling once it opens its branch's pull request", async () => {
    const p = polling(createInitialState([], [], "local", ""))
    await p.poll.tick()
    expect(p.asked).toEqual([])

    p.setState({ ...p.state(), appMode: "pr", prInfo: branchPr, source: "gh:o/r#7" })
    await p.poll.tick()
    expect(p.asked).toEqual(["probe o/r#7", "comments o/r#7 at head-1"])
  })

  test("comments are read at the head riff last loaded", async () => {
    const p = polling(createInitialState([], [], "gh:o/r#7", "", null, null, [], "pr", branchPr))
    await p.poll.tick()
    p.setHeadSha("head-2")
    await p.poll.tick()
    expect(p.asked.filter((a) => a.startsWith("comments"))).toEqual([
      "comments o/r#7 at head-1",
      "comments o/r#7 at head-2",
    ])
  })

  test("a focus regain routed through the focus handler polls a PR review", async () => {
    const p = polling(createInitialState([], [], "gh:o/r#7", "", null, null, [], "pr", branchPr), { intervalSeconds: 300, onFocus: true })
    let reloads = 0
    const onFocus = focusHandler({
      appMode: () => p.state().appMode,
      setPollFocused: p.poll.setFocused,
      reloadLocal: () => {
        reloads++
      },
    })
    onFocus(false)
    await p.poll.tick()
    expect(p.asked).toEqual([])

    onFocus(true)
    await p.stamped
    p.poll.stop()
    expect(p.asked).toEqual(["probe o/r#7", "comments o/r#7 at head-1"])
    expect(reloads).toBe(0)
  })

  test("a tick that succeeds stamps the refresh time", async () => {
    const p = polling(createInitialState([], [], "gh:o/r#7", "", null, null, [], "pr", branchPr))
    await p.poll.tick()
    expect(p.stamps()).toBe(1)
  })

  test("a tick whose fetch throws leaves the refresh time alone", async () => {
    const p = polling(createInitialState([], [], "gh:o/r#7", "", null, null, [], "pr", branchPr), undefined, {
      fetchPrReviewComments: async () => {
        throw new Error("gh is down")
      },
    })
    await p.poll.tick()
    expect(p.asked).toEqual(["probe o/r#7"])
    expect(p.stamps()).toBe(0)
  })
})
