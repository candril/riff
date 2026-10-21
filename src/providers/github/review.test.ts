import { test, expect, describe } from "bun:test"
import { commentRange, reviewPayload } from "./review"
import { createComment, type Comment } from "../../types"

const comment = (over: Partial<Comment>): Comment => ({
  ...createComment("src/a.ts", 10, "looks off", "LEFT"),
  ...over,
})

describe("commentRange", () => {
  test("a comment without a start line is no range", () => {
    expect(commentRange(comment({}))).toBeUndefined()
  })

  test("a start on or after the end line is no range", () => {
    expect(commentRange(comment({ startLine: 10 }))).toBeUndefined()
    expect(commentRange(comment({ startLine: 12 }))).toBeUndefined()
  })

  test("a real range starts on the comment's own side", () => {
    expect(commentRange(comment({ startLine: 7 }))).toEqual({ startLine: 7, startSide: "LEFT" })
  })
})

describe("reviewPayload", () => {
  test("carries commit, event and body exactly as given", () => {
    const payload = JSON.parse(reviewPayload("abc123", "REQUEST_CHANGES", "please fix", []))
    expect(payload).toEqual({ commit_id: "abc123", event: "REQUEST_CHANGES", body: "please fix", comments: [] })
  })

  test("only a ranged comment carries start_line and start_side", () => {
    const payload = JSON.parse(
      reviewPayload("abc123", "COMMENT", "", [comment({}), comment({ startLine: 4, line: 9, side: "RIGHT" })]),
    )
    expect(payload.comments).toEqual([
      { path: "src/a.ts", line: 10, side: "LEFT", body: "looks off" },
      { path: "src/a.ts", line: 9, side: "RIGHT", body: "looks off", start_line: 4, start_side: "RIGHT" },
    ])
  })

  test("serialises fields in a fixed order", () => {
    expect(reviewPayload("sha", "COMMENT", "", [comment({ startLine: 3 })])).toBe(
      '{"commit_id":"sha","event":"COMMENT","body":"","comments":[{"path":"src/a.ts","line":10,"side":"LEFT","body":"looks off","start_line":3,"start_side":"LEFT"}]}',
    )
  })
})
