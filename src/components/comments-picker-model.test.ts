import { describe, test, expect } from "bun:test"
import { commentsPickerModel } from "./comments-picker-model"
import type { CommentsPickerEntry } from "../features/comments-picker/filter"
import type { Comment } from "../types"
import { theme, colors } from "../theme"

/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

function entry(
  id: string,
  extra: Partial<Comment> & { isRoot?: boolean; threadResolved?: boolean } = {}
): CommentsPickerEntry {
  const { isRoot = true, threadResolved = false, ...comment } = extra
  return {
    comment: { id, filename: "src/a.ts", line: 3, side: "RIGHT", body: "", createdAt: "", status: "local", ...comment },
    preview: `preview ${id}`,
    isRoot,
    threadResolved,
  }
}

describe("commentsPickerModel", () => {
  test("titles the list, and says so when there are no comments", () => {
    expect(commentsPickerModel([entry("1")], 0, TALL)).toMatchObject({ title: "Find Comments", count: "1/1", hints: ["esc"], empty: null })
    expect(commentsPickerModel([], 0, TALL)).toMatchObject({ count: "0", rows: [], empty: "No comments" })
  })

  test("marks each comment by where it stands", () => {
    const glyphs = commentsPickerModel(
      [
        entry("reply", { isRoot: false }),
        entry("resolved", { threadResolved: true }),
        entry("local", { status: "local" }),
        entry("pending", { status: "pending" }),
        entry("synced", { status: "synced" }),
      ],
      0
    , TALL).rows.map((r) => [r.id, r.glyph, r.glyphFg])
    expect(glyphs).toEqual([
      ["reply", "↳", theme.overlay0],
      ["resolved", "✓", colors.commentResolved],
      ["local", "●", colors.commentLocal],
      ["pending", "○", colors.commentPending],
      ["synced", "·", colors.commentSynced],
    ])
  })

  test("gives each row its place, preview and author, brighter when selected", () => {
    const [selected, other] = commentsPickerModel([entry("1", { author: "octocat" }), entry("2")], 0, TALL).rows
    expect(selected).toMatchObject({
      selected: true,
      location: "src/a.ts:3",
      locationFg: theme.text,
      preview: "preview 1",
      previewFg: theme.subtext0,
      author: "@octocat",
    })
    expect(other).toMatchObject({ selected: false, locationFg: theme.subtext1, previewFg: theme.overlay0, author: null })
  })

  test("draws a local comment's author, stored with its @, with one @", () => {
    const [local] = commentsPickerModel([entry("1", { author: "@you" })], 0, TALL).rows
    expect(local!.author).toBe("@you")
  })
})
