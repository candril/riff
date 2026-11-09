import { describe, expect, test } from "bun:test"
import {
  caretContent,
  displayAuthor,
  formatTimeAgo,
  getStatusColor,
  threadPanelModel,
  visibleOverlayCommentIds,
  type ThreadPanelInput,
} from "./thread-panel-model"
import { emptyPickerMessage } from "./thread-panel-picker"
import { threadTextWidth } from "./thread-rows-estimate"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

const NOW = Date.parse("2026-10-21T12:00:00Z")
const ago = (ms: number) => new Date(NOW - ms).toISOString()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function comment(id: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: ago(5 * MINUTE),
    status: "synced",
    author: "alice",
    ...fields,
  }
}

function model(input: Partial<ThreadPanelInput> = {}) {
  return threadPanelModel({
    comments: [],
    scopeFilename: "src/greet.ts",
    composeFilename: "src/greet.ts",
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
    width: 48,
    viewportRows: 0,
    pickerRoom: null,
    mentionPicker: null,
    emojiPicker: null,
    symbolPicker: null,
    symbolCandidates: [],
    mentionCandidates: [],
    mentionSearchQuery: null,
    expandedThreadIds: new Set(),
    unseenIds: new Set(),
    filter: "",
    filterInput: false,
    openOnly: null,
    flashLabels: new Map(),
    now: NOW,
    ...input,
  })
}

const many = (count: number) => Array.from({ length: count }, (_, i) => comment(`c${i}`, i + 1))
const keys = (m: ReturnType<typeof model>) => m.threads.map((thread) => thread.key)

describe("the thread panel's window", () => {
  test("starts two threads above the highlight", () => {
    const m = model({ comments: many(40), highlightedIndex: 10 })
    expect(keys(m)[0]).toBe("c8")
    expect(m.window.before).toBe(8)
  })

  test("does not start above the first thread", () => {
    const m = model({ comments: many(40), highlightedIndex: 1 })
    expect(keys(m)[0]).toBe("c0")
    expect(m.window.before).toBe(0)
  })

  test("mounts 24 threads, or 80 when widened, and counts the rest after", () => {
    const narrow = model({ comments: many(100) })
    expect(narrow.threads).toHaveLength(24)
    expect(narrow.window.after).toBe(76)

    const wide = model({ comments: many(100), expanded: true })
    expect(wide.threads).toHaveLength(80)
    expect(wide.window.after).toBe(20)
  })

  test("is the window flash labels", () => {
    // Every third thread is a resolved pair, collapsed to its header, except
    // one that `za` opened; the rest are open pairs.
    const comments = Array.from({ length: 40 }, (_, i) => {
      const resolved = i % 3 === 0
      return [
        comment(`t${i}`, i + 1, { isThreadResolved: resolved }),
        comment(`t${i}r`, i + 1, { inReplyTo: `t${i}`, isThreadResolved: resolved }),
      ]
    }).flat()
    const expandedThreadIds = new Set(["t33"])
    const m = model({ comments, highlightedIndex: 50, expandedThreadIds })
    const drawn = m.threads.flatMap((thread) =>
      thread.header.caret !== null ? [thread.key] : thread.comments.map((c) => c.key)
    )
    expect(m.threads.some((thread) => thread.header.caret !== null)).toBe(true)
    expect(m.threads.find((thread) => thread.key === "t33")!.comments).toHaveLength(2)
    expect(
      visibleOverlayCommentIds(comments, expandedThreadIds, 50, false, { textWidth: threadTextWidth(48), viewportRows: 0 })
    ).toEqual(drawn)
  })
})

describe("the thread panel's threads", () => {
  const replies = [comment("r1", 3), comment("r2", 3, { inReplyTo: "r1", author: "bob" })]
  const resolved = replies.map((c) => ({ ...c, isThreadResolved: c.id === "r1" }))

  test("an expanded thread lists every comment, root flush and replies indented", () => {
    const m = model({ comments: replies })
    const [thread] = m.threads
    expect(thread!.header.caret).toBeNull()
    expect(thread!.header.author).toBeNull()
    expect(thread!.header.badge).toBeNull()
    expect(thread!.comments.map((c) => [c.key, c.indent, c.connector, c.bodyIndent])).toEqual([
      ["r1", 0, null, 4],
      ["r2", 2, "└ ", 6],
    ])
    expect(m.threadSizes).toEqual([3])
  })

  test("a collapsed thread is its header alone", () => {
    const m = model({ comments: [comment("x1", 1), ...resolved] })
    expect(m.threads.map((thread) => thread.comments.length)).toEqual([1, 0])
    expect(m.threadSizes).toEqual([2, 1])
    expect(m.threads[1]!.header.author).toBe("@alice")
  })

  test("expandedThreadIds flips a thread's default fold", () => {
    expect(model({ comments: resolved, expandedThreadIds: new Set(["r1"]) }).threadSizes).toEqual([3])
    expect(model({ comments: replies, expandedThreadIds: new Set(["r1"]) }).threadSizes).toEqual([1])
  })

  test("divides by line, or by file and line when unscoped", () => {
    expect(model({ comments: replies }).threads[0]!.header.divider).toBe("─ line 3")
    expect(model({ comments: replies, scopeFilename: null }).threads[0]!.header.divider).toBe("─ greet.ts:3")
  })

  test("badges resolved with ✓, a folded open thread with ⋯, counting only past one", () => {
    const badge = (comments: Comment[], expanded: string[] = []) =>
      model({ comments, expandedThreadIds: new Set(expanded) }).threads[0]!.header.badge
    expect(badge(resolved)).toEqual({ text: "✓ 2", fg: theme.green })
    expect(badge(resolved.slice(0, 1))).toEqual({ text: "✓", fg: theme.green })
    expect(badge(resolved, ["r1"])).toEqual({ text: "✓ 2", fg: theme.green })
    expect(badge(replies, ["r1"])).toEqual({ text: "⋯ 2", fg: theme.overlay0 })
    expect(badge(replies.slice(0, 1), ["r1"])).toEqual({ text: "⋯", fg: theme.overlay0 })
  })

  test("flags outdated and unseen threads", () => {
    const outdated = [{ ...replies[0]!, outdated: true }, replies[1]!]
    const header = model({ comments: outdated, unseenIds: new Set(["r2"]) }).threads[0]!.header
    expect(header.outdated).toBe(true)
    expect(header.unseen).toBe(true)
    const plain = model({ comments: replies }).threads[0]!.header
    expect(plain.outdated).toBe(false)
    expect(plain.unseen).toBe(false)
  })

  test("a highlighted collapsed thread carries the caret", () => {
    const header = model({ comments: resolved }).threads[0]!.header
    expect(header).toMatchObject({ caret: "▸ ", caretFg: theme.blue, highlighted: true })
    const other = model({ comments: [comment("x1", 1), ...resolved] }).threads[1]!.header
    expect(other).toMatchObject({ caret: "  ", caretFg: theme.overlay0, highlighted: false })
  })

  test("a flash label takes the caret's place on a comment and on a collapsed header", () => {
    const flashLabels = new Map([["r1", "f"], ["z1", "gh"]])
    const m = model({ comments: [...replies, comment("z1", 9, { isThreadResolved: true })], flashLabels })
    expect(m.threads[0]!.comments[0]).toMatchObject({ caret: "f ", caretFg: colors.flashLabel, highlighted: true })
    expect(m.threads[0]!.comments[1]).toMatchObject({ caret: "  ", caretFg: theme.overlay0 })
    expect(m.threads[1]!.header).toMatchObject({ caret: "gh", caretFg: colors.flashLabel })
  })

  test("a comment row says who, when, its status and whether it is edited or being edited", () => {
    const comments = [comment("a1", 1, { status: "local", localEdit: "new body", author: "@you", createdAt: ago(2 * HOUR) })]
    const [row] = model({ comments, editingId: "a1" }).threads[0]!.comments
    expect(row).toMatchObject({
      author: "@you",
      time: "2h",
      status: "local",
      statusFg: colors.commentLocal,
      edited: true,
      editing: true,
      bodyText: "new body",
      reactions: null,
    })
  })

  test("lifts images out of the body and keeps reactions", () => {
    const reactions = [{ content: "+1" as const, count: 1, viewerHasReacted: true }]
    const comments = [comment("a1", 1, { body: "look\n\n![shot](https://example.com/s.png)", reactions })]
    const [row] = model({ comments }).threads[0]!.comments
    expect(row!.bodyText.trim()).toBe("look")
    expect(row!.images).toEqual([{ label: "shot", url: "https://example.com/s.png" }])
    expect(row!.reactions).toEqual(reactions)
  })

  test("is empty without comments", () => {
    expect(model().empty).toBe(true)
    expect(model({ comments: many(1) }).empty).toBe(false)
  })
})

describe("the thread panel's header", () => {
  test("names the file, the filter and the count", () => {
    expect(model({ comments: many(1), filter: "nit" }).header).toEqual({
      label: "greet.ts",
      filterText: "nit",
      filterInput: false,
      note: null,
      noteFg: colors.secondary,
      right: "1 comment",
      labelFg: colors.textMuted,
      rightFg: theme.overlay0,
    })
    expect(model({ comments: many(2), focused: true, scopeFilename: null }).header).toMatchObject({
      label: "all files",
      filterText: null,
      right: "2 comments",
      labelFg: colors.primary,
    })
  })

  test("drops the count while the filter is typed, and says what the composer does", () => {
    expect(model({ filterInput: true }).header.right).toBeNull()
    expect(model({ mode: "compose" }).header.right).toBe("Composing")
    expect(model({ mode: "edit" }).header.right).toBe("Editing")
  })

  test("says when the open-only toggle is on and how many threads it hides, in the filter's colour", () => {
    const header = model({ comments: many(2), filter: "nit", openOnly: { hidden: 3 } }).header
    expect(header.note).toBe("open only · 3 hidden")
    expect(header.noteFg).toBe(colors.secondary)
    expect(header.filterText).toBe("nit")
    // The count is what is shown, not what there is.
    expect(header.right).toBe("2 comments")
    expect(model({ comments: many(2), openOnly: { hidden: 0 } }).header.note).toBe("open only · 0 hidden")
    expect(model({ comments: many(2) }).header.note).toBeNull()
  })
})

describe("the thread panel's empty text", () => {
  test("says the toggle hides every thread, and how to show them", () => {
    const m = model({ openOnly: { hidden: 2 } })
    expect(m.empty).toBe(true)
    expect(m.emptyText).toBe("No open threads · H shows all")
  })

  test("stays as it was when there are no threads to hide", () => {
    expect(model().emptyText).toBe("No comments in this file yet.")
    expect(model({ openOnly: { hidden: 0 } }).emptyText).toBe("No comments in this file yet.")
  })
})

describe("the thread panel's composer", () => {
  const onLine3 = [comment("a1", 3)]
  const label = (input: Partial<ThreadPanelInput>) => model({ comments: onLine3, mode: "compose", ...input }).composer?.label

  test("is absent outside compose and edit", () => {
    expect(model().composer).toBeNull()
  })

  test("labels what is written and where", () => {
    expect(model({ mode: "edit" }).composer).toEqual({ mode: "edit", label: "Editing comment" })
    expect(label({ note: true })).toBe("Note @ greet.ts:3 — local only, never published")
    expect(label({ replyToThread: true })).toBe("Reply @ greet.ts:3")
    expect(label({})).toBe("New thread @ greet.ts:3")
    expect(label({ line: 4 })).toBe("New comment @ greet.ts:4")
    expect(label({ composeFilename: "src/other.ts" })).toBe("New comment @ other.ts:3")
    expect(label({ comments: [] })).toBe("New comment @ greet.ts:3")
  })
})

describe("the thread panel's hints", () => {
  const hunk = "@@ -1,1 +1,1 @@\n-a\n+b"
  const hintKeys = (input: Partial<ThreadPanelInput>) => model({ focused: true, ...input }).hints!.map(([key]) => key)

  test("are absent while composing", () => {
    expect(model({ mode: "compose" }).hints).toBeNull()
    expect(model({ mode: "edit" }).hints).toBeNull()
  })

  test("offer focus and close while unfocused", () => {
    expect(model({ comments: many(1) }).hints).toEqual([["Ctrl-l", "focus"], ["Ctrl-t", "close"]])
  })

  test("offer new or draft, and the way out, on an empty panel", () => {
    expect(model({ focused: true }).hints).toEqual([["n", "new"], ["Ctrl-h", "diff"], ["Ctrl-e", "expand"], ["q", "close"]])
    expect(model({ focused: true, draft: "wip" }).hints![0]).toEqual(["n", "draft"])
  })

  test("offer code, image and submit only when the highlighted comment allows them", () => {
    const base = ["n", "j/k", "za", "r", "e", "d", "x", "o", "Ctrl-h", "Ctrl-e", "q"]
    expect(hintKeys({ comments: many(1) })).toEqual(base)
    expect(hintKeys({ comments: [comment("a1", 1, { diffHunk: hunk })] })).toContain("c")
    expect(hintKeys({ comments: [comment("a1", 1, { body: "![x](https://example.com/x.png)" })] })).toContain("O")
    expect(hintKeys({ comments: [comment("a1", 1, { status: "local" })], appMode: "pr" })).toContain("S")
    expect(hintKeys({ comments: [comment("a1", 1, { localEdit: "b" })], appMode: "pr" })).toContain("S")
    expect(hintKeys({ comments: [comment("a1", 1, { status: "local" })], appMode: "local" })).not.toContain("S")
    expect(hintKeys({ comments: many(1), appMode: "pr" })).not.toContain("S")
  })
})

describe("the thread panel's pickers", () => {
  const compose = { mode: "compose" as const }
  const mentionRows = (names: string[], selected: number) => ({
    kind: "rows" as const,
    title: "@mention",
    accent: theme.blue,
    rows: names.map((text) => ({ text })),
    selected,
  })

  test("only while composing, the emoji session winning over a mention one", () => {
    const mentionPicker = { query: "", selectedIndex: 0, atOffset: 0 }
    expect(model({ mentionPicker }).picker).toBeNull()
    expect(model({ ...compose }).picker).toBeNull()
    expect(
      model({ ...compose, mentionPicker, emojiPicker: { query: "zzzq", selectedIndex: 0, colonOffset: 0 } }).picker
    ).toEqual({ kind: "emoji-empty", text: "No emoji for :zzzq" })
  })

  test("list the emoji found, the selection clamped to them", () => {
    const picker = model({ ...compose, emojiPicker: { query: "tada", selectedIndex: 9, colonOffset: 0 } }).picker
    expect(picker).toMatchObject({ kind: "emoji", selected: 0 })
    expect(picker?.kind === "emoji" && picker.rows[0]!.name).toBe("tada")
  })

  test("list the symbols a code span matches, the selection clamped to them", () => {
    const picker = model({
      ...compose,
      symbolPicker: { query: "fan", selectedIndex: 4, backtickOffset: 0 },
      symbolCandidates: ["other", "FancyViewController"],
    }).picker
    expect(picker).toMatchObject({ kind: "symbol", picker: { kind: "rows", title: "`symbol", selected: 0 } })
    expect(picker?.kind === "symbol" && picker.picker.kind === "rows" && picker.picker.rows.map((row) => row.text)).toEqual([
      "FancyViewController",
    ])
  })

  test("draw no picker for a code span that matches nothing", () => {
    const symbolPicker = { query: "zzzq", selectedIndex: 0, backtickOffset: 0 }
    expect(model({ ...compose, symbolPicker, symbolCandidates: ["other"] }).picker).toBeNull()
  })

  test("list the names a mention matches, the selection clamped to them", () => {
    const picker = model({
      ...compose,
      mentionPicker: { query: "bo", selectedIndex: 3, atOffset: 0 },
      mentionCandidates: ["alice", "bob"],
    }).picker
    expect(picker).toMatchObject({ kind: "mention", picker: mentionRows(["@bob"], 0) })
  })

  test("draw a mention row as its author is drawn, a local @you unprefixed", () => {
    const picker = model({
      ...compose,
      mentionPicker: { query: "", selectedIndex: 0, atOffset: 0 },
      mentionCandidates: ["@you", "alice"],
    }).picker
    expect(picker).toMatchObject({ kind: "mention", picker: mentionRows(["@you", "@alice"], 0) })
  })

  test("say why a mention finds nobody", () => {
    const empty = (query: string, mentionSearchQuery: string | null) =>
      model({ ...compose, mentionPicker: { query, selectedIndex: 0, atOffset: 0 }, mentionSearchQuery }).picker
    expect(empty("", null)).toEqual({ kind: "mention", picker: { kind: "empty", text: "No participants to mention" } })
    expect(empty("zed", "zed")).toEqual({ kind: "mention", picker: { kind: "empty", text: "Searching GitHub for @zed…" } })
    expect(empty("zed", "ze")).toEqual({ kind: "mention", picker: { kind: "empty", text: "No match for @zed" } })
    expect(emptyPickerMessage("zed", null)).toBe("No match for @zed")
  })
})

describe("the thread panel's text", () => {
  test("times a comment in minutes, hours, days and weeks, then by date", () => {
    expect(formatTimeAgo(ago(30_000), NOW)).toBe("now")
    expect(formatTimeAgo(ago(5 * MINUTE), NOW)).toBe("5m")
    expect(formatTimeAgo(ago(59 * MINUTE), NOW)).toBe("59m")
    expect(formatTimeAgo(ago(3 * HOUR), NOW)).toBe("3h")
    expect(formatTimeAgo(ago(6 * DAY), NOW)).toBe("6d")
    expect(formatTimeAgo(ago(15 * DAY), NOW)).toBe("2w")
    const old = ago(45 * DAY)
    expect(formatTimeAgo(old, NOW)).toBe(new Date(old).toLocaleDateString([], { month: "short", day: "numeric" }))
  })

  test("prefixes a GitHub login with @, but not the local @you", () => {
    expect(displayAuthor("alice")).toBe("@alice")
    expect(displayAuthor("@you")).toBe("@you")
  })

  test("leads a row with its flash label, else the caret", () => {
    expect(caretContent("a", false)).toBe("a ")
    expect(caretContent(undefined, true)).toBe("▸ ")
    expect(caretContent(undefined, false)).toBe("  ")
  })

  test("colours each status", () => {
    expect(getStatusColor("local")).toBe(colors.commentLocal)
    expect(getStatusColor("pending")).toBe(colors.commentPending)
    expect(getStatusColor("synced")).toBe(colors.commentSynced)
  })
})

describe("the @mention picker's highlighted matches (spec 007)", () => {
  const rowsFor = (query: string, mentionCandidates: string[]) => {
    const picker = model({ mode: "compose", mentionPicker: { query, selectedIndex: 0, atOffset: 0 }, mentionCandidates }).picker
    return picker?.kind === "mention" && picker.picker.kind === "rows" ? picker.picker.rows : []
  }

  test("the login's matched characters land past the @ the row adds", () => {
    expect(rowsFor("al", ["alice", "bob"])).toEqual([
      {
        text: "@alice",
        spans: [
          { text: "@", matched: false },
          { text: "al", matched: true },
          { text: "ice", matched: false },
        ],
      },
    ])
  })

  test("a local @you, stored with its @, lands on the same characters", () => {
    expect(rowsFor("you", ["@you", "alice"])[0]!.spans).toEqual([
      { text: "@", matched: false },
      { text: "you", matched: true },
    ])
  })

  test("no query draws every login plain", () => {
    expect(rowsFor("", ["alice"])[0]!.spans).toEqual([{ text: "@alice", matched: false }])
  })
})
