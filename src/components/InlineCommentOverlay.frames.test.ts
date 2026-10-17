import { test, expect, describe, afterEach } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { InlineCommentOverlay, type InlineCommentOverlayProps } from "./InlineCommentOverlay"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

const WIDTH = 48
const HEIGHT = 30
const FRAME_GLYPHS = /[┌┐└┘│─├┤]/

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function comment(id: string, line: number, resolved: boolean): Comment {
  return {
    id,
    filename: "greet.ts",
    line,
    side: "RIGHT",
    // The markdown bodies live in a pool bound to the first renderer that
    // drew one, which an earlier test file has already destroyed.
    body: "",
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    isThreadResolved: resolved,
  }
}

// The resolved thread is collapsed, so the highlight lands on its header row.
const COMMENTS = [comment("a1", 3, true), comment("b1", 10, false)]

async function mountPanel(props: Partial<InlineCommentOverlayProps> = {}) {
  mounted = await mountRenderable(
    (renderer) =>
      InlineCommentOverlay({
        comments: COMMENTS,
        scopeFilename: "greet.ts",
        composeFilename: "greet.ts",
        line: 3,
        replyToThread: false,
        note: false,
        mode: "view",
        appMode: "local",
        highlightedIndex: 0,
        editingId: null,
        draft: "",
        focused: false,
        expanded: false,
        width: WIDTH,
        mentionPicker: null,
        emojiPicker: null,
        mentionCandidates: [],
        mentionSearchQuery: null,
        expandedThreadIds: new Set(),
        unseenIds: new Set(),
        filter: "",
        filterInput: false,
        flashLabels: new Map(),
        renderer: renderer as unknown as CliRenderer,
        ...props,
      }),
    { width: WIDTH, height: HEIGHT }
  )
  const rows = (await mounted.frame()).split("\n")
  return { rows, spans: mounted.setup.captureSpans() }
}

const rowWith = (rows: string[], text: string) => rows.findIndex((row) => row.includes(text))

describe("the thread panel", () => {
  test("draws no frame: the header keeps its inset, the panel is mantle and the highlighted thread surface0", async () => {
    const { rows, spans } = await mountPanel()
    // A thread's own divider is content, not a frame.
    expect(rows.join("\n").replace(/─ line \d+/g, "")).not.toMatch(FRAME_GLYPHS)

    expect(rows[0]!.indexOf("greet.ts")).toBe(2)

    const empty = rows.findIndex((row, y) => y > 0 && row.trim() === "")
    expect(empty).toBeGreaterThan(0)
    expect(bgAt(spans, 0, empty)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, WIDTH - 1, empty)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, 0, 0)).toEqual(ints(theme.mantle))

    const highlighted = rowWith(rows, "─ line 3")
    expect(rows[highlighted]).toContain("▸")
    expect(bgAt(spans, rows[highlighted]!.indexOf("line 3"), highlighted)).toEqual(ints(theme.surface0))
    const other = rowWith(rows, "─ line 10")
    expect(bgAt(spans, rows[other]!.indexOf("line 10"), other)).toEqual(ints(theme.mantle))
  })

  test("shows focus in the header text's colour", async () => {
    const focused = await mountPanel({ focused: true })
    expect(fgAt(focused.spans, 2, 0)).toEqual(ints(colors.primary))
    await mounted!.dispose()

    const unfocused = await mountPanel({ focused: false })
    expect(fgAt(unfocused.spans, 2, 0)).toEqual(ints(colors.textMuted))
  })

  test("sets the composer apart as surface0 on the mantle panel, its text where the frame's inset kept it", async () => {
    const { rows, spans } = await mountPanel({ mode: "compose" })
    expect(rows.join("\n").replace(/─ line \d+/g, "")).not.toMatch(FRAME_GLYPHS)

    const label = rowWith(rows, "New thread @ greet.ts:3")
    const textColumn = rows[label]!.indexOf("New thread")
    expect(textColumn).toBe(6)
    for (const y of [label, label + 1, label + 2, label + 3]) {
      expect(bgAt(spans, textColumn, y)).toEqual(ints(theme.surface0))
      expect(bgAt(spans, 0, y)).toEqual(ints(theme.mantle))
      expect(bgAt(spans, WIDTH - 1, y)).toEqual(ints(theme.mantle))
    }
    expect(bgAt(spans, textColumn, label - 1)).toEqual(ints(theme.mantle))
  })

  test("floats the mention picker unframed on mantle, its selected row surface0", async () => {
    const { rows, spans } = await mountPanel({
      mode: "compose",
      mentionPicker: { query: "ali", selectedIndex: 0, atOffset: 0 },
      mentionCandidates: ["alice", "bob", "alicia"],
    })
    const title = rowWith(rows, "@mention")
    const selected = rowWith(rows, "▸ @alice")
    const other = rowWith(rows, "@alicia")
    expect(title).toBeGreaterThan(-1)
    expect(selected).toBe(title + 1)
    expect(other).toBe(title + 2)

    for (let y = title - 1; y <= other + 2; y++) expect(rows[y]).not.toMatch(FRAME_GLYPHS)
    expect(bgAt(spans, rows[selected]!.indexOf("@alice"), selected)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, rows[other]!.indexOf("@alicia"), other)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, rows[title]!.indexOf("@mention"), title)).toEqual(ints(theme.mantle))
  })
})
