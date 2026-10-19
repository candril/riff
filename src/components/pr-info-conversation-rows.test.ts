import { describe, expect, test } from "bun:test"
import { conversationComments, prInfo, PR_NOW, reviews, reviewThreadComments } from "../testing/pr-info"
import { theme } from "../theme"
import type { ReactionSummary } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import { conversationItems } from "./pr-info-conversation"
import { fileDiffContext, hunkLines, inlineReactions, reactionPills } from "./pr-info-conversation-parts"
import {
  conversationRows,
  packNames,
  type BodyPart,
  type ConversationInput,
  type ConversationRow,
} from "./pr-info-conversation-rows"
import { flatConversationItems, type FlatConversationItem } from "./pr-info-items"

const NOW = PR_NOW.getTime()

function flat(expanded: ReadonlySet<string> = new Set(), extra: Parameters<typeof prInfo>[1] = {}): FlatConversationItem[] {
  const info = prInfo("", { reviews: reviews(), conversationComments: conversationComments(), ...extra })
  return flatConversationItems(conversationItems(info, reviewThreadComments(), new Set()), "", expanded)
}

function rows(items: FlatConversationItem[], over: Partial<ConversationInput> = {}): ConversationRow[] {
  return conversationRows(items, {
    selected: -1,
    labels: new Map(),
    expanded: new Set(),
    terminalWidth: 120,
    diffContext: () => null,
    now: NOW,
    ...over,
  }).rows
}

const text = (row: ConversationRow) => row.header.map((segment) => segment.text).join("")
const cell = (row: ConversationRow, needle: string) => row.header.find((segment) => segment.text.includes(needle))!
const bodyOf = (row: ConversationRow): BodyPart[] => (row.kind === "item" ? row.body : [])

const BOB_REVIEW = "PRR_bob2"
const withThreads = (...ids: string[]) => new Set([BOB_REVIEW, ...ids])

describe("conversationRows", () => {
  test("draws a note and no rows when there is nothing to list", () => {
    expect(conversationRows([], { selected: -1, labels: new Map(), expanded: new Set(), terminalWidth: 120, diffContext: () => null })).toEqual({
      rows: [],
      note: "No comments",
    })
  })

  test("lays a collapsed comment out as icon, PR, author, preview, reactions and time, only the preview growing", () => {
    const [dana] = rows(flat())
    expect(dana!.header.map((segment) => [segment.text, segment.flex])).toEqual([
      ["▶ ", "fixed"],
      ["PR ", "fixed"],
      ["@dana", "fixed"],
      ["  I tried this on staging and it works for me. one two", "grow"],
      ["  👍2 🚀1", "fixed"],
      ["    6h", "fixed"],
    ])
    expect(dana!.header.map((segment) => segment.fg)).toEqual([
      theme.subtext0,
      theme.overlay1,
      theme.sapphire,
      theme.subtext1,
      theme.overlay1,
      theme.overlay0,
    ])
    expect(cell(dana!, "@dana").primary).toBe(true)
    expect(bodyOf(dana!)).toEqual([])
  })

  test("opens a comment onto its pooled markdown and its reaction pills", () => {
    const items = flat()
    const [dana] = rows(items, { expanded: new Set(["501"]) })
    expect(text(dana!)).toBe("▼ PR @dana  👍2 🚀1    6h")
    expect(cell(dana!, "@dana").fg).toBe(theme.sapphire)
    expect(dana!.header[3]).toEqual({ text: "", fg: theme.subtext1, flex: "grow" })
    expect(bodyOf(dana!)).toEqual([
      { kind: "markdown", id: "pr-comment-501", text: conversationComments()[0]!.body, images: [], indent: 4 },
      {
        kind: "reactions",
        indent: 4,
        pills: [
          { text: "👍 2", fg: theme.subtext1 },
          { text: "🚀 1", fg: theme.blue },
        ],
      },
    ])
  })

  test("greys a bot's author and preview out, selected or not", () => {
    const items = flat()
    for (const selected of [-1, 6]) {
      const bot = rows(items, { selected })[6]!
      expect(cell(bot, "@deploy-bot[bot]").fg).toBe(theme.overlay0)
      expect(cell(bot, "Deployed").fg).toBe(theme.overlay0)
    }
  })

  test("marks the selected row: author blue, words in text, the rest unchanged", () => {
    const list = rows(flat(), { selected: 0 })
    expect(list[0]!.selected).toBe(true)
    expect(cell(list[0]!, "@dana").fg).toBe(theme.blue)
    expect(cell(list[0]!, "I tried").fg).toBe(theme.text)
    expect(list[1]!.selected).toBe(false)
    expect(cell(list[1]!, "@alice").fg).toBe(theme.sapphire)
  })

  test("keeps every key across a cursor move", () => {
    const items = flat()
    const keys = (selected: number) => rows(items, { selected }).map((row) => row.key)
    expect(keys(1)).toEqual(keys(4))
    expect(keys(1)).toEqual(["501", "PRR_alice", "PRR_bob1", "PRR_erin", BOB_REVIEW, "PRR_carol", "502"])
  })

  test("puts a flash label on the row it names", () => {
    const list = rows(flat(), { labels: new Map([["conversation:2", "sd"]]) })
    expect(list[2]!.label).toBe("sd")
    expect(list[1]!.label).toBeUndefined()
  })

  test("says a collapsed review's state and how many threads it holds", () => {
    const list = rows(flat())
    const bob = list[4]!
    expect(bob.header.map((segment) => segment.text)).toEqual(["▶ ", "✗  ", "@bob", "  requested changes", "  (3 threads)", "    2h"])
    expect(bob.header[1]!.fg).toBe(theme.red)
    expect(cell(bob, "(3 threads)")).toEqual({ text: "  (3 threads)", fg: theme.overlay0, flex: "grow" })
    expect(text(list[1]!)).toBe("▶ ✓  @alice  approved    5h")
    expect(text(list[5]!)).toBe("▶ ○  @carol  commented    1h")
  })

  test("opens a review onto its body, drops the count, and lists its threads indented by two", () => {
    const items = flat(new Set(["PRR_carol", BOB_REVIEW]))
    const list = rows(items, { expanded: new Set(["PRR_carol", BOB_REVIEW]) })
    expect(cell(list[4]!, "requested").text).toBe("  requested changes")
    expect(list[4]!.header[4]).toEqual({ text: "", fg: theme.subtext1, flex: "grow" })
    expect(bodyOf(list[4]!)).toEqual([])
    const carol = list.find((row) => row.key === "PRR_carol")!
    expect(bodyOf(carol)).toEqual([
      { kind: "markdown", id: "review-PRR_carol", text: reviews()[4]!.body!, images: [], indent: 4 },
    ])
    const thread = list[5]!
    expect(thread.kind === "item" && thread.indent).toBe(2)
    expect(text(thread)).toBe("▶  greet.ts:12  @bob  Rename greet to welcome, it reads better in the call sit…  (3)    1h")
  })

  test("marks a resolved thread with a green tick, an open one with a subtext0 arrow", () => {
    const list = rows(flat(withThreads()), { expanded: withThreads() })
    expect(list[5]!.header[0]).toEqual({ text: "▶ ", fg: theme.subtext0, flex: "fixed" })
    expect(list[6]!.header[0]).toEqual({ text: "✓ ", fg: theme.green, flex: "fixed" })
    expect(rows(flat(withThreads("t1")), { expanded: withThreads("t1") })[5]!.header[0]!.text).toBe("▼ ")
  })

  test("gives the thread's file name a quarter of the terminal, between twenty and forty", () => {
    const fileCell = (width: number) => rows(flat(withThreads()), { expanded: withThreads(), terminalWidth: width })[7]!.header[1]!.text
    expect(fileCell(80)).toBe(" an-extremely-l…:40  ")
    expect(fileCell(120)).toBe(" an-extremely-long-module…:40  ")
    expect(fileCell(200)).toBe(" an-extremely-long-module-name-that…:40  ")
  })

  test("opens a thread onto its hunk, body, reactions and each reply", () => {
    const expanded = withThreads("t1")
    const [, , , , , t1] = rows(flat(expanded), { expanded })
    expect(text(t1!)).toBe("▼  greet.ts:12  @bob    1h")
    expect(bodyOf(t1!)).toEqual([
      {
        kind: "hunk",
        indent: 6,
        lines: [
          { text: "@@ -10,3 +10,4 @@ export function greet()", fg: theme.blue },
          { text: " const a = 1", fg: theme.overlay1 },
          { text: "-const old = 2", fg: theme.red },
          { text: "+const greet = 3", fg: theme.green },
        ],
      },
      { kind: "markdown", id: "thread-t1", text: "Rename `greet` to `welcome`, it reads better in the call sites.", images: [], indent: 6 },
      { kind: "reply", indent: 6, author: "someone", time: "    1h" },
      { kind: "markdown", id: "reply-t1r1", text: "Done, renamed.", images: [], indent: 8 },
      { kind: "reply", indent: 6, author: "bob", time: "    1h" },
      { kind: "markdown", id: "reply-t1r2", text: "Thanks!", images: [], indent: 8 },
    ])
  })

  test("falls back to the loaded diff around the line when the thread has no hunk", () => {
    const expanded = withThreads("t2")
    const asked: [string, number][] = []
    const t2 = rows(flat(expanded), {
      expanded,
      diffContext: (filename, line) => {
        asked.push([filename, line])
        return "@@ -1,2 +1,3 @@\n+bye"
      },
    })[6]!
    expect(asked).toEqual([["src/farewell.ts", 3]])
    expect(bodyOf(t2)[0]).toEqual({
      kind: "hunk",
      indent: 6,
      lines: [
        { text: "@@ -1,2 +1,3 @@", fg: theme.blue },
        { text: "+bye", fg: theme.green },
      ],
    })
    const none = rows(flat(expanded), { expanded })[6]!
    expect(bodyOf(none)[0]!.kind).toBe("markdown")
  })

  test("names a body's pictures by their alt text", () => {
    const comments = conversationComments()
    comments[0]!.body = 'Look: <img alt="screenshot" src="https://x/y.png">'
    const items = flat(new Set(), { conversationComments: comments })
    const part = bodyOf(rows(items, { expanded: new Set(["501"]) })[0]!)[0]!
    expect(part.kind === "markdown" && part.images).toEqual(["screenshot"])
  })

  test("packs pending reviewers under one yellow header, blue when selected", () => {
    const items = flat(new Set(), { requestedReviewers: ["frank", "grace"] })
    const last = items.length - 1
    const block = rows(items, { selected: last })[last]!
    expect(block.kind).toBe("reviewers")
    if (block.kind !== "reviewers") return
    expect(block.header).toEqual([
      { text: "○ ", fg: theme.yellow, flex: "fixed" },
      { text: "awaiting review (2)", fg: theme.yellow, flex: "fixed", primary: true },
    ])
    expect(block.names).toEqual([{ text: "@frank  @grace", fg: theme.blue }])
    expect(block.namesIndent).toBe(4)
    const idle = rows(items)[last]!
    expect(idle.kind === "reviewers" && idle.names[0]!.fg).toBe(theme.sapphire)
  })
})

describe("packNames", () => {
  test("wraps once the names outgrow the terminal less eight cells, never below twenty", () => {
    const names = ["aaaaaaaa", "bbbbbbbb", "cccccccc"]
    // Each piece is "@" + 8 plus a two-space separator: 11 cells.
    expect(packNames(names, 30)).toEqual(["@aaaaaaaa  @bbbbbbbb", "@cccccccc"])
    expect(packNames(names, 41)).toEqual(["@aaaaaaaa  @bbbbbbbb  @cccccccc"])
    expect(packNames(names, 10)).toEqual(["@aaaaaaaa", "@bbbbbbbb", "@cccccccc"])
  })
})

describe("reactions", () => {
  const summary: ReactionSummary[] = [
    { content: "+1", count: 2, viewerHasReacted: false },
    { content: "heart", count: 0, viewerHasReacted: true },
    { content: "rocket", count: 0, viewerHasReacted: false },
  ]

  test("inline, only what anyone has left, with no gap between emoji and count", () => {
    expect(inlineReactions(summary)).toBe("👍2")
    expect(inlineReactions(undefined)).toBe("")
  })

  test("as pills, also the viewer's own at zero, blue", () => {
    expect(reactionPills(summary)).toEqual([
      { text: "👍 2", fg: theme.subtext1 },
      { text: "❤️ 0", fg: theme.blue },
    ])
  })
})

describe("hunkLines", () => {
  test("keeps the last eight lines", () => {
    const hunk = Array.from({ length: 10 }, (_, i) => ` line ${i}`).join("\n")
    expect(hunkLines(hunk).map((line) => line.text)).toEqual(Array.from({ length: 8 }, (_, i) => ` line ${i + 2}`))
  })

  test("drops a trailing empty line, and draws an empty line in the middle as a space", () => {
    expect(hunkLines("+a\n").map((line) => line.text)).toEqual(["+a"])
    expect(hunkLines("+a\n\n+b").map((line) => line.text)).toEqual(["+a", " ", "+b"])
  })
})

describe("fileDiffContext", () => {
  const file = (content: string): DiffFile => ({ filename: "a.ts", additions: 0, deletions: 0, status: "modified", content })

  test("starts at the hunk header above the line and runs four lines past it", () => {
    const content = ["diff", "@@ -1,9 +1,9 @@", ...Array.from({ length: 12 }, (_, i) => ` ${i + 1}`)].join("\n")
    expect(fileDiffContext([file(content)], "a.ts", 6)?.split("\n")).toEqual([
      "@@ -1,9 +1,9 @@",
      ...Array.from({ length: 8 }, (_, i) => ` ${i + 1}`),
    ])
  })

  test("is nothing for a file that is not loaded", () => {
    expect(fileDiffContext([file("x")], "b.ts", 1)).toBeNull()
    expect(fileDiffContext([file("")], "a.ts", 1)).toBeNull()
  })
})
