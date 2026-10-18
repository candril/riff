import { test, expect, describe } from "bun:test"
import { gatherSyncItems, type SyncItem } from "./sync-items"
import { syncPreviewModel } from "./sync-preview-model"
import type { Comment } from "../types"

function comment(id: string, extra: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/greet.ts",
    line: 3,
    side: "RIGHT",
    body: "x",
    createdAt: "2026-01-10T10:00:00Z",
    status: "local",
    ...extra,
  }
}

const IDLE = { loading: false, error: null }
const kinds = (items: SyncItem[]) => items.map((i) => `${i.type}:${i.comment.id}`)

describe("gatherSyncItems", () => {
  test("an edit needs a synced comment with a local edit and a GitHub id", () => {
    const items = gatherSyncItems([
      comment("ok", { status: "synced", githubId: 1, localEdit: "new" }),
      comment("no-edit", { status: "synced", githubId: 2 }),
      comment("no-id", { status: "synced", localEdit: "new" }),
      comment("pending", { status: "pending", githubId: 3, localEdit: "new" }),
    ])
    expect(kinds(items)).toEqual(["edit:ok"])
    expect(items[0]!.newBody).toBe("new")
  })

  test("a reply needs a parent GitHub knows", () => {
    const synced = comment("p", { status: "synced", githubId: 7 })
    const local = comment("q")
    const items = gatherSyncItems([
      synced,
      local,
      comment("r1", { inReplyTo: "p" }),
      comment("r2", { inReplyTo: "q" }),
      comment("r3", { inReplyTo: "gone" }),
    ])
    expect(kinds(items)).toEqual(["new:q", "reply:r1"])
    expect(items[1]!.parent).toBe(synced)
  })

  test("new means a local top-level comment", () => {
    const items = gatherSyncItems([comment("a"), comment("b", { status: "synced", githubId: 1 }), comment("c", { status: "pending" })])
    expect(kinds(items)).toEqual(["new:a"])
  })

  test("a thread resolved locally contributes nothing", () => {
    const root = comment("root", { isThreadResolved: true })
    expect(gatherSyncItems([root, comment("r", { inReplyTo: "root" })])).toEqual([])
  })
})

const NEW: SyncItem = { type: "new", comment: comment("n", { body: "Rename this" }) }
const EDIT: SyncItem = {
  type: "edit",
  comment: comment("e", { line: 8, status: "synced", githubId: 9, body: "Off by one" }),
  newBody: "Off by two",
}
const REPLY: SyncItem = {
  type: "reply",
  comment: comment("r", { line: 12, body: "Agreed", inReplyTo: "p" }),
  parent: comment("p", { status: "synced", githubId: 7, author: "octo" }),
}

describe("syncPreviewModel", () => {
  test("puts new comments, edits and replies in that order, counted in their titles", () => {
    const model = syncPreviewModel([REPLY, NEW, EDIT, NEW], IDLE)
    expect(model.sections.map((s) => s.title)).toEqual(["New Comments (2)", "Edits (1)", "Replies (1)"])
  })

  test("a new comment is one added line, an edit a removed and an added one, a reply a plain line to its author", () => {
    const [added, edited, replied] = syncPreviewModel([NEW, EDIT, REPLY], IDLE).sections.map((s) => s.cards[0])
    expect(added).toEqual({ location: "src/greet.ts:3", lines: [{ sign: "+", text: "Rename this", tone: "added" }] })
    expect(edited).toEqual({
      location: "src/greet.ts:8",
      lines: [
        { sign: "-", text: "Off by one", tone: "removed" },
        { sign: "+", text: "Off by two", tone: "added" },
      ],
    })
    expect(replied).toEqual({ location: "src/greet.ts:12", replyTo: "octo", lines: [{ text: "Agreed", tone: "plain" }] })
  })

  test("leaves the keys it has no value for out, rather than undefined", () => {
    const [added, , replied] = syncPreviewModel([NEW, EDIT, REPLY], IDLE).sections.map((s) => s.cards[0]!)
    expect("replyTo" in added!).toBe(false)
    expect("sign" in replied!.lines[0]!).toBe(false)
  })

  test("a reply to a comment with no author answers @unknown", () => {
    const anonymous = { ...REPLY, parent: comment("p", { status: "synced", githubId: 7 }) }
    expect(syncPreviewModel([anonymous], IDLE).sections[0]!.cards[0]!.replyTo).toBe("unknown")
  })

  test("cuts a body to 59 characters and an ellipsis past 60, and keeps only its first line", () => {
    const body = (text: string) => syncPreviewModel([{ type: "new", comment: comment("n", { body: text }) }], IDLE).sections[0]!.cards[0]!.lines[0]!.text
    expect(body("a".repeat(60))).toBe("a".repeat(60))
    expect(body("a".repeat(61))).toBe("a".repeat(59) + "…")
    expect(body("First line\nsecond line")).toBe("First line")
    expect(body("  padded  ")).toBe("padded")
  })

  test("with nothing to sync there are no sections and no button", () => {
    expect(syncPreviewModel([], IDLE)).toEqual({ sections: [], footer: { status: { kind: "none" }, button: null } })
  })

  test("the button counts the changes, in the singular for one", () => {
    expect(syncPreviewModel([NEW], IDLE).footer.button).toBe("Sync 1 change")
    expect(syncPreviewModel([NEW, EDIT, REPLY], IDLE).footer.button).toBe("Sync 3 changes")
  })

  test("the footer says it is syncing over any error, and shows an error otherwise", () => {
    expect(syncPreviewModel([NEW], { loading: true, error: "Boom" }).footer.status).toEqual({ kind: "loading" })
    expect(syncPreviewModel([NEW], { loading: false, error: "Boom" }).footer.status).toEqual({ kind: "error", message: "Boom" })
    expect(syncPreviewModel([NEW], { loading: false, error: "" }).footer.status).toEqual({ kind: "none" })
  })
})
