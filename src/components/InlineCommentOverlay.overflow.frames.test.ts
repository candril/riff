import { test, expect, describe, afterEach } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { InlineCommentOverlay, type InlineCommentOverlayProps } from "./InlineCommentOverlay"
import { bgAt, fgAt, ints, mountRenderable, trimFrame } from "../testing/frame"
import { theme } from "../theme"
import type { Comment } from "../types"

const WIDTH = 48
const HEIGHT = 30
// The header takes the first row and the key hints the last; the viewport is everything between.
const FIRST_ROW = 1
const LAST_ROW = HEIGHT - 2
const TEXT_COLUMN = 3

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function thread(i: number): Comment {
  return {
    id: `t${i}`,
    filename: "greet.ts",
    line: i * 2 + 1,
    side: "RIGHT",
    body: `body-${i}-end`,
    createdAt: "2026-01-10T10:00:00Z",
    status: "synced",
    author: "alice",
  }
}

const threads = (count: number) => Array.from({ length: count }, (_, i) => thread(i))

function mount(props: Partial<InlineCommentOverlayProps>) {
  return mountRenderable(
    (renderer) =>
      InlineCommentOverlay({
        comments: [],
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
}

async function mountPanel(props: Partial<InlineCommentOverlayProps>) {
  mounted = await mount(props)
  const rows = (await mounted.frame()).split("\n")
  return { rows, spans: mounted.setup.captureSpans() }
}

/** Threads whose body row is readable above the bottom edge row: the ones drawn whole. */
const wholeThreads = (rows: string[], count: number) =>
  threads(count).filter((_, i) => {
    const y = rows.findIndex((row) => row.includes(`body-${i}-end`))
    return y >= 0 && y < LAST_ROW
  }).length

function expectHint(rows: string[], spans: ReturnType<TestRendererSetup["captureSpans"]>, y: number, text: string) {
  expect(rows[y]!.trim()).toBe(text)
  expect(rows[y]!.indexOf(text)).toBe(TEXT_COLUMN)
  for (let x = TEXT_COLUMN; x < TEXT_COLUMN + text.length; x++) {
    expect(fgAt(spans, x, y)).toEqual(ints(theme.overlay0))
    expect(bgAt(spans, x, y)).toEqual(ints(theme.mantle))
  }
}

describe("the thread panel's edge hints", () => {
  test("say nothing while every thread fits", async () => {
    const { rows } = await mountPanel({ comments: threads(2) })
    const frame = rows.join("\n")
    expect(frame).not.toContain("↑")
    expect(frame).not.toContain("↓")
    expect(rows[LAST_ROW]!.trim()).toBe("")
  })

  test("count on the bottom edge row the threads not drawn whole, above the key hints", async () => {
    const { rows, spans } = await mountPanel({ comments: threads(12) })
    const hidden = 12 - wholeThreads(rows, 12)
    expect(hidden).toBe(8)
    expectHint(rows, spans, LAST_ROW, `↓ ${hidden} more`)
    expect(rows[LAST_ROW + 1]).toContain("Ctrl-t")
    expect(rows.join("\n")).not.toContain("↑")
    for (const row of rows.filter((row) => row.includes("─ line"))) expect(row.indexOf("─")).toBe(TEXT_COLUMN)
  })

  test("count on the top edge row the threads above the window", async () => {
    const { rows, spans } = await mountPanel({ comments: threads(12), highlightedIndex: 6 })
    expectHint(rows, spans, FIRST_ROW, "↑ 4")
    const hidden = 12 - 4 - wholeThreads(rows, 12)
    expect(hidden).toBe(4)
    expectHint(rows, spans, LAST_ROW, `↓ ${hidden} more`)
  })

  test("count the threads past the window together with the ones it clips", async () => {
    const { rows, spans } = await mountPanel({ comments: threads(30) })
    const hidden = 30 - wholeThreads(rows, 30)
    expect(hidden).toBe(6 + 20)
    expectHint(rows, spans, LAST_ROW, `↓ ${hidden} more`)
    const frame = rows.join("\n")
    expect(frame).not.toContain("more thread")
    expect(frame).not.toContain("earlier thread")
  })

  test("are right on the first frame, since the panel is rebuilt every pass", async () => {
    mounted = await mount({ comments: threads(12) })
    await mounted.setup.renderOnce()
    const rows = trimFrame(mounted.setup.captureCharFrame()).split("\n")
    expectHint(rows, mounted.setup.captureSpans(), LAST_ROW, "↓ 8 more")
  })
})
