import { describe, test, expect } from "bun:test"
import { commentsPickerModel } from "./comments-picker-model"
import { buildEntries, filterEntries, type CommentsPickerEntry } from "../features/comments-picker/filter"
import type { AppState } from "../state"
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
      0,
      TALL
    ).rows.map((r) => [r.id, r.glyph, r.glyphFg])
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

describe("commentsPickerModel: highlighted matches (spec 044)", () => {
  const m = (text: string) => ({ text, matched: true })
  const u = (text: string) => ({ text, matched: false })
  const rowFor = (comment: Partial<Comment>, query: string) => {
    const [built] = buildEntries({ comments: [{ ...entry("1").comment, ...comment }] } as AppState)
    return commentsPickerModel(filterEntries([built!], query), 0, TALL).rows[0]
  }

  test("a body match lands on the preview, shifted by where the preview sits in the body", () => {
    const row = rowFor({ body: "\n  nit: rename this\nsecond line", author: "octocat" }, "ren")
    expect(row).toMatchObject({
      preview: "nit: rename this",
      previewSpans: [u("nit: "), m("ren"), u("ame this")],
      locationSpans: [u("src/a.ts:3")],
      authorSpans: [u("@octocat")],
    })
  })

  test("a body match below the first line has nothing to show in the preview", () => {
    expect(rowFor({ body: "nit: rename this\nsecond line" }, "second")!.previewSpans).toEqual([u("nit: rename this")])
  })

  test("a body match below the first line shows the first line's own match, when it matches by itself", () => {
    // The body's best match is the substring in "second"; the preview holds sec only scattered.
    expect(rowFor({ body: "see the cap\nsecond line" }, "sec")!.previewSpans).toEqual([m("se"), u("e the "), m("c"), u("ap")])
  })

  test("a body match on the first line keeps the body's positions, shifted onto the preview", () => {
    expect(rowFor({ body: "\n  see the cap\nsecond" }, "cap")!.previewSpans).toEqual([u("see the "), m("cap")])
  })

  test("a filename match lands on the location", () => {
    expect(rowFor({ body: "zzz", filename: "src/domain/FamilyReadModel.cs" }, "readmodel")!.locationSpans).toEqual([
      u("src/domain/Family"),
      m("ReadModel"),
      u(".cs:3"),
    ])
  })

  test("an author match lands past the @ the row adds, or on the @-less name of a local author", () => {
    expect(rowFor({ body: "zzz", author: "octocat" }, "oct")!.authorSpans).toEqual([u("@"), m("oct"), u("ocat")])
    expect(rowFor({ body: "zzz", author: "@you" }, "you")!.authorSpans).toEqual([u("@"), m("you")])
  })
})
