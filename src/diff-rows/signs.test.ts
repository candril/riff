import { describe, expect, test } from "bun:test"
import { colors, theme } from "../theme"
import type { Comment } from "../types"
import { code, mappingOf } from "./fixtures"
import { commentSigns } from "./signs"

const comment = (line: number, side: Comment["side"], extra: Partial<Comment> = {}): Comment => ({
  id: `${side}${line}`,
  filename: code.filename,
  line,
  side,
  body: "why?",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
  ...extra,
})

describe("commentSigns", () => {
  const mapping = mappingOf({}, [code])
  const lineOf = (type: string, lineNum: number) =>
    mapping.allLines.findIndex(
      (line) => line.type === type && (type === "deletion" ? line.oldLineNum : line.newLineNum) === lineNum
    )

  const colourOf = (extra: Partial<Comment>) =>
    commentSigns(mapping, [comment(1, "RIGHT", extra)]).get(lineOf("context", 1))?.color

  test("a resolved thread is dim whatever its status", () => {
    expect(colourOf({ status: "synced", isThreadResolved: true })).toBe(colors.commentResolved)
  })

  test("each status has its colour, and a synced comment with an unsent edit reads as pending", () => {
    expect(colourOf({})).toBe(theme.blue)
    expect(colourOf({ status: "pending" })).toBe(theme.yellow)
    expect(colourOf({ status: "synced" })).toBe(theme.green)
    expect(colourOf({ status: "synced", localEdit: "edit" })).toBe(theme.yellow)
  })

  test("a removed and an added line carry their sign in their own half", () => {
    const signs = commentSigns(mapping, [comment(2, "LEFT"), comment(2, "RIGHT", { status: "synced" })])
    expect(signs.get(lineOf("deletion", 2))).toEqual({ color: theme.blue, side: "left" })
    expect(signs.get(lineOf("addition", 2))).toEqual({ color: theme.green, side: "right" })
  })

  test("a context line is in both halves, so the comment's side picks one", () => {
    expect(commentSigns(mapping, [comment(1, "LEFT")]).get(lineOf("context", 1))?.side).toBe("left")
    expect(commentSigns(mapping, [comment(3, "RIGHT")]).get(lineOf("context", 3))?.side).toBe("right")
  })

  test("a comment on a line the diff does not show has no sign", () => {
    expect(commentSigns(mapping, [comment(40, "RIGHT")]).size).toBe(0)
  })
})
