import { test, expect, describe, afterEach } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import { createThreadPanelIsland, type ThreadPanelIsland } from "../app/thread-panel"
import type { ThreadPanelInput } from "./thread-panel-model"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

const WIDTH = 48
const HEIGHT = 30
const FRAME_GLYPHS = /[┌┐└┘│─├┤]/

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
let island: ThreadPanelIsland | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function comment(id: string, line: number, resolved: boolean, body: string): Comment {
  return {
    id,
    filename: "greet.ts",
    line,
    side: "RIGHT",
    body,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
    isThreadResolved: resolved,
  }
}

// The resolved thread is collapsed, so the highlight lands on its header row.
const COMMENTS = [comment("a1", 3, true, "Looks good"), comment("b1", 10, false, "Rename this")]

async function mountPanel(props: Partial<ThreadPanelInput> = {}) {
  mounted = await mountRenderable(
    (renderer) => {
      island = createThreadPanelIsland(renderer as unknown as CliRenderer)
      island.update({
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
        viewportRows: 0,
        mentionPicker: null,
        emojiPicker: null,
        mentionCandidates: [],
        mentionSearchQuery: null,
        expandedThreadIds: new Set(),
        unseenIds: new Set(),
        filter: "",
        filterInput: false,
        openOnly: null,
        flashLabels: new Map(),
        now: Date.now(),
        ...props,
      })
      return island.host
    },
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

  test("sets the composer apart as surface0 on the mantle panel, its text in the thread list's column", async () => {
    const { rows, spans } = await mountPanel({ mode: "compose" })
    expect(rows.join("\n").replace(/─ line \d+/g, "")).not.toMatch(FRAME_GLYPHS)

    const threadColumn = rows[rowWith(rows, "─ line 10")]!.indexOf("─")
    const label = rowWith(rows, "New thread @ greet.ts:3")
    const textColumn = rows[label]!.indexOf("New thread")
    expect(textColumn).toBe(threadColumn)
    expect(textColumn).toBe(3)
    for (const y of [label, label + 1]) {
      expect(bgAt(spans, textColumn, y)).toEqual(ints(theme.surface0))
      expect(bgAt(spans, textColumn - 1, y)).toEqual(ints(theme.surface0))
      expect(bgAt(spans, textColumn - 2, y)).toEqual(ints(theme.mantle))
      expect(bgAt(spans, WIDTH - 3, y)).toEqual(ints(theme.surface0))
      expect(bgAt(spans, WIDTH - 2, y)).toEqual(ints(theme.mantle))
    }
    expect(bgAt(spans, textColumn, label - 1)).toEqual(ints(theme.mantle))
  })

  test("starts the composer's text where the empty state's text starts", async () => {
    const { rows } = await mountPanel({ mode: "compose", comments: [] })
    const empty = rowWith(rows, "No comments in this file yet.")
    const label = rowWith(rows, "New comment @ greet.ts:3")
    expect(rows[label]!.indexOf("New comment")).toBe(rows[empty]!.indexOf("No comments"))
  })

  test("is as tall as its label and what is typed, with no empty rows under the input", async () => {
    const { rows, spans } = await mountPanel({ mode: "compose" })
    const label = rowWith(rows, "New thread @ greet.ts:3")
    const textColumn = rows[label]!.indexOf("New thread")
    expect(rows[label + 1]).toContain("Type a comment")
    expect(bgAt(spans, textColumn, label + 2)).toEqual(ints(theme.mantle))

    island!.composer.setValue("one\ntwo\nthree")
    const typed = (await mounted!.frame()).split("\n")
    const typedSpans = mounted!.setup.captureSpans()
    const typedLabel = rowWith(typed, "New thread @ greet.ts:3")
    expect(typed.slice(typedLabel + 1, typedLabel + 4).map((row) => row.slice(textColumn).trim())).toEqual([
      "one",
      "two",
      "three",
    ])
    expect(bgAt(typedSpans, textColumn, typedLabel + 3)).toEqual(ints(theme.surface0))
    expect(bgAt(typedSpans, textColumn, typedLabel + 4)).toEqual(ints(theme.mantle))
  })

  test("draws no key hints under the composer, in a PR or locally; they are in g?", async () => {
    for (const appMode of ["pr", "local"] as const) {
      const { rows } = await mountPanel({ mode: "compose", appMode })
      const frame = rows.join("\n")
      expect(frame).not.toContain("save & publish")
      expect(frame).not.toContain("Ctrl-j")
      expect(frame).not.toContain("Esc cancel")
      await mounted!.dispose()
      mounted = null
    }
    const view = await mountPanel({ focused: false })
    expect(view.rows.find((row) => row.includes("Ctrl-t"))).toContain("close")
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
