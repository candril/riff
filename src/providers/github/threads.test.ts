import { test, expect, describe } from "bun:test"
import { mergeReviewComments } from "./threads"

const rest = (over: Record<string, unknown>) => ({
  body: "",
  path: "src/a.ts",
  line: 10,
  original_line: 10,
  side: "RIGHT",
  user: { login: "octo" },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  html_url: "https://github.com/o/r/pull/1#c",
  diff_hunk: "@@",
  pull_request_review_id: 7,
  ...over,
})

describe("folding GraphQL threads into REST comments", () => {
  const thread = {
    id: "PRRT_1",
    isResolved: true,
    isOutdated: false,
    path: "src/a.ts",
    line: 10,
    comments: {
      nodes: [
        { databaseId: 1, reactionGroups: [] },
        {
          databaseId: 2,
          reactionGroups: [{ content: "HEART", viewerHasReacted: true, reactors: { totalCount: 2 } }],
        },
      ],
    },
  }

  test("the thread's id and resolution land on its root, reactions on whichever comment carries them", () => {
    const [root, reply] = mergeReviewComments(
      [rest({ id: 1 }), rest({ id: 2, in_reply_to_id: 1, line: null, original_line: null })],
      [thread]
    )
    expect(root!.graphqlThreadId).toBe("PRRT_1")
    expect(root!.isThreadResolved).toBe(true)
    expect(root!.reactions).toEqual([])
    expect(reply!.graphqlThreadId).toBeUndefined()
    expect(reply!.reactions).toEqual([{ content: "heart", count: 2, viewerHasReacted: true }])
  })

  test("a reply REST sends without a line takes its root's anchor", () => {
    const [, reply] = mergeReviewComments(
      [rest({ id: 1, line: 42, side: "LEFT" }), rest({ id: 2, in_reply_to_id: 1, line: null, original_line: null, path: "x" })],
      [thread]
    )
    expect(reply!.line).toBe(42)
    expect(reply!.side).toBe("LEFT")
    expect(reply!.path).toBe("src/a.ts")
  })

  test("without a GraphQL thread, an outdated comment is read off REST's null line", () => {
    const [comment] = mergeReviewComments([rest({ id: 9, line: null, original_line: 5 })], [])
    expect(comment!.isOutdated).toBe(true)
    expect(comment!.reactions).toEqual([])
  })
})
