import { test, expect, describe, afterEach } from "bun:test"
import type { SyncItem } from "./sync-items"
import { syncPreviewModel } from "./sync-preview-model"
import { createSyncPreviewIsland } from "../app/sync-preview"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import type { Comment } from "../types"

/*
 * The modal on a 100-wide screen: an 80-wide mantle panel in the middle,
 * so its left edge is column 10 and its padded text starts at column 12.
 */

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

async function show(items: SyncItem[], { loading = false, error = null as string | null } = {}, height = 30) {
  mounted = await mountRenderable(
    (renderer) => {
      const island = createSyncPreviewIsland(renderer)
      island.update(syncPreviewModel(items, { loading, error }))
      return island.host
    },
    { width: 100, height }
  )
  const lines = (await mounted.frame()).split("\n")
  return { lines, spans: mounted.setup.captureSpans() }
}

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

const PARENT = comment("p", { status: "synced", githubId: 7, author: "octo" })
const NEW: SyncItem = { type: "new", comment: comment("n", { body: "Rename this" }) }
const EDIT: SyncItem = {
  type: "edit",
  comment: comment("e", { line: 8, status: "synced", githubId: 9, body: "Off by one" }),
  newBody: "Off by two",
}
const REPLY: SyncItem = {
  type: "reply",
  comment: comment("r", { line: 12, body: "Agreed", inReplyTo: "p" }),
  parent: PARENT,
}
// Out of section order, so only the modal's grouping puts them in order.
const ALL = [REPLY, NEW, EDIT]

const PANEL = [
  "            Sync Changes                                                             esc",
  "",
  "",
  "            New Comments (1)",
  "",
  "",
  "             src/greet.ts:3",
  "             + Rename this",
  "",
  "",
  "            Edits (1)",
  "",
  "",
  "             src/greet.ts:8",
  "             - Off by one",
  "             + Off by two",
  "",
  "",
  "            Replies (1)",
  "",
  "",
  "             src/greet.ts:12 → @octo",
  "             Agreed",
  "",
  "",
  "",
]

describe("the sync preview", () => {
  test("with nothing to sync says so and offers no Sync button", async () => {
    const { lines, spans } = await show([])
    expect(lines).toEqual([
      ...Array(10).fill(""),
      "            Sync Changes                                                             esc",
      "",
      "",
      "",
      "",
      "            No changes to sync",
    ])
    expect(fgAt(spans, 12, 15)).toEqual(ints(theme.overlay0))
    expect(lines.join("\n")).not.toContain("Sync 0")
    // Header 3, content 7, footer 3: the footer is bare mantle.
    for (let x = 10; x < 90; x++) expect(bgAt(spans, x, 20)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 21)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 22)).not.toEqual(ints(theme.mantle))
  })

  test("lists new comments, edits and replies in that order, each in a surface0 card on the mantle panel", async () => {
    const { lines, spans } = await show(ALL, {}, 40)
    expect(lines).toEqual([
      ...Array(7).fill(""),
      ...PANEL,
      "                                                                        Sync 3 changes",
    ])

    for (const y of [6, 10, 11, 16, 24, 31, 34]) {
      expect(bgAt(spans, 10, y)).toEqual(ints(theme.mantle))
      expect(bgAt(spans, 89, y)).toEqual(ints(theme.mantle))
    }
    expect(bgAt(spans, 9, 6)).not.toEqual(ints(theme.mantle))
    expect(bgAt(spans, 90, 6)).not.toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 5)).not.toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 35)).not.toEqual(ints(theme.mantle))

    // Each card spans the content width and its own padding rows.
    for (const [top, bottom] of [[12, 15], [19, 23], [27, 30]] as const) {
      for (let y = top; y <= bottom; y++) {
        expect(bgAt(spans, 12, y)).toEqual(ints(theme.surface0))
        expect(bgAt(spans, 87, y)).toEqual(ints(theme.surface0))
        expect(bgAt(spans, 11, y)).toEqual(ints(theme.mantle))
        expect(bgAt(spans, 88, y)).toEqual(ints(theme.mantle))
      }
      expect(bgAt(spans, 12, top - 1)).toEqual(ints(theme.mantle))
      expect(bgAt(spans, 12, bottom + 1)).toEqual(ints(theme.mantle))
    }

    expect(fgAt(spans, 12, 7)).toEqual(ints(theme.text))
    expect(fgAt(spans, 85, 7)).toEqual(ints(theme.overlay0))
    for (const y of [10, 17, 25]) expect(fgAt(spans, 12, y)).toEqual(ints(theme.subtext0))

    for (const y of [13, 20, 28]) expect(fgAt(spans, 13, y)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 13, 14)).toEqual(ints(theme.green))
    expect(fgAt(spans, 15, 14)).toEqual(ints(theme.green))
    expect(fgAt(spans, 13, 21)).toEqual(ints(theme.red))
    expect(fgAt(spans, 15, 21)).toEqual(ints(theme.red))
    expect(fgAt(spans, 13, 22)).toEqual(ints(theme.green))
    expect(fgAt(spans, 15, 22)).toEqual(ints(theme.green))

    const reply = lines[28]!
    expect(fgAt(spans, reply.indexOf("→"), 28)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, reply.indexOf("@octo"), 28)).toEqual(ints(theme.lavender))
    expect(fgAt(spans, 13, 29)).toEqual(ints(theme.text))

    const button = lines[33]!
    const label = button.indexOf("Sync 3 changes")
    expect(bgAt(spans, label - 2, 33)).toEqual(ints(theme.blue))
    expect(bgAt(spans, label + 15, 33)).toEqual(ints(theme.blue))
    expect(bgAt(spans, label - 3, 33)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, label + 16, 33)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, label, 33)).toEqual(ints(theme.base))
    expect(label + 16).toBe(88)
  })

  test("while syncing says so in yellow and greys the button out", async () => {
    const { lines, spans } = await show(ALL, { loading: true }, 40)
    expect(lines[33]).toBe("            Syncing...                                                  Sync 3 changes")
    expect(fgAt(spans, 12, 33)).toEqual(ints(theme.yellow))
    expect(bgAt(spans, 70, 33)).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, 87, 33)).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, 72, 33)).toEqual(ints(theme.surface0))
  })

  test("a failed sync shows its error in red beside a live button", async () => {
    const { lines, spans } = await show(ALL, { error: "Boom" }, 40)
    expect(lines[33]).toBe("            Boom                                                        Sync 3 changes")
    expect(fgAt(spans, 12, 33)).toEqual(ints(theme.red))
    expect(bgAt(spans, 70, 33)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 72, 33)).toEqual(ints(theme.base))
  })

  test("cuts a long body to 59 characters and an ellipsis, and shows only a body's first line", async () => {
    const { lines } = await show([
      { type: "new", comment: comment("n", { body: "a".repeat(30) + " " + "b".repeat(40) }) },
      { type: "new", comment: comment("m", { line: 4, body: "First line\nsecond line" }) },
    ])
    expect(lines).toEqual([
      ...Array(7).fill(""),
      "            Sync Changes                                                             esc",
      "",
      "",
      "            New Comments (2)",
      "",
      "",
      "             src/greet.ts:3",
      "             + aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbbbbbbbbbbbbbbbbbbbb…",
      "",
      "",
      "",
      "             src/greet.ts:4",
      "             + First line",
      "",
      "",
      "",
      "                                                                        Sync 2 changes",
    ])
    expect(lines[14]!.slice(15)).toHaveLength(60)
  })

  test("one change reads in the singular", async () => {
    const { lines } = await show([NEW])
    expect(lines).toEqual([
      ...Array(9).fill(""),
      "            Sync Changes                                                             esc",
      "",
      "",
      "            New Comments (1)",
      "",
      "",
      "             src/greet.ts:3",
      "             + Rename this",
      "",
      "",
      "",
      "                                                                         Sync 1 change",
    ])
  })

  test("more changes than fit in 80% of the screen are clipped, with the footer whole on its own row and no rows overlapping", async () => {
    const many: SyncItem[] = Array.from({ length: 8 }, (_, i) => ({
      type: "new",
      comment: comment(`n${i}`, { line: i, body: `b${i}` }),
    }))
    const { lines, spans } = await show(many)
    expect(lines).toEqual([
      "",
      "",
      "",
      "",
      "            Sync Changes                                                             esc",
      "",
      "",
      "            New Comments (8)",
      "",
      "",
      "             src/greet.ts:0",
      "             + b0",
      "",
      "",
      "",
      "             src/greet.ts:1",
      "             + b1",
      "",
      "",
      "",
      "             src/greet.ts:2",
      "             + b2",
      "",
      "",
      "",
      " ".repeat(72) + "Sync 8 changes",
    ])
    // 80% of 30 rows: the panel holds rows 3 to 26 and no more.
    expect(bgAt(spans, 10, 3)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 26)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 2)).not.toEqual(ints(theme.mantle))
    expect(bgAt(spans, 10, 27)).not.toEqual(ints(theme.mantle))
    // The list gives way alone: the last card that fits ends above the
    // list's own padding, and the next one is cut away whole.
    expect(bgAt(spans, 12, 22)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 12, 23)).toEqual(ints(theme.mantle))
    // The footer keeps its padding and its one row: the button flush right
    // with its own padding, blue under the button alone.
    expect(bgAt(spans, 69, 25)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 70, 25)).toEqual(ints(theme.blue))
    expect(bgAt(spans, 87, 25)).toEqual(ints(theme.blue))
    expect(bgAt(spans, 88, 25)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, 72, 25)).toEqual(ints(theme.base))
    expect(bgAt(spans, 70, 24)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 70, 26)).toEqual(ints(theme.mantle))
  })
})
