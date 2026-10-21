import { test, expect, describe, afterEach } from "bun:test"
import type { CliRenderer } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createThreadPanelIsland } from "../app/thread-panel"
import type { ThreadPanelInput } from "./thread-panel-model"
import { endComposerSession } from "./CommentComposer"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"
import type { Comment } from "../types"

const WIDTH = 64
const HEIGHT = 34
// The full focused hint set runs past any panel the diff leaves room for; a wide one keeps it whole.
const WIDE = 160

type Spans = ReturnType<TestRendererSetup["captureSpans"]>

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  endComposerSession()
  await mounted?.dispose()
  mounted = null
})

// Within 30 days, so the time is a bucket rather than a locale-dependent date.
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

function comment(id: string, line: number, fields: Partial<Comment> = {}): Comment {
  return {
    id,
    filename: "src/greet.ts",
    line,
    side: "RIGHT",
    body: `body of ${id}`,
    createdAt: minutesAgo(5),
    status: "synced",
    author: "alice",
    ...fields,
  }
}

async function mountPanel(props: Partial<ThreadPanelInput> = {}, width = WIDTH) {
  await mounted?.dispose()
  mounted = await mountRenderable(
    (renderer) => {
      const island = createThreadPanelIsland(renderer as unknown as CliRenderer)
      island.update({
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
        width,
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
        ...props,
      })
      return island.host
    },
    { width, height: HEIGHT }
  )
  const rows = (await mounted.frame()).split("\n")
  return { rows, spans: mounted.setup.captureSpans() }
}

const rowWith = (rows: string[], text: string) => rows.findIndex((row) => row.includes(text))

function fgOf(rows: string[], spans: Spans, text: string, from = 0) {
  const y = rows.findIndex((row, i) => i >= from && row.includes(text))
  expect(y).toBeGreaterThanOrEqual(0)
  return fgAt(spans, rows[y]!.indexOf(text), y)
}

const hintRow = (rows: string[]) => rows[rows.length - 1]!.trim()

describe("the thread panel's expanded thread", () => {
  const thread = [
    comment("r1", 3, { status: "local", localEdit: "body of r1, edited", createdAt: minutesAgo(3 * 24 * 60) }),
    comment("r2", 3, { inReplyTo: "r1", status: "pending", author: "bob", createdAt: minutesAgo(120) }),
    comment("r3", 3, { inReplyTo: "r1", status: "synced", author: "@you" }),
  ]

  test("heads the thread with its line, and each comment with caret, author, time and status", async () => {
    const { rows } = await mountPanel({ comments: thread, editingId: "r1" })
    const divider = rowWith(rows, "─ line 3")
    expect(rows[divider]!.trim()).toBe("─ line 3")
    expect(rows[divider]!.indexOf("─")).toBe(3)

    // The stack's gap leaves a blank row between the divider and the first comment.
    expect(rows[divider + 1]!.trim()).toBe("")
    expect(rows[divider + 2]!.slice(3).trimEnd()).toBe("▸ @alice 3d [local] *edited (editing)")
    expect(rows[divider + 3]!.slice(3).trim()).toBe("body of r1, edited")
    expect(rows[divider + 3]!.indexOf("body")).toBe(3 + 4)

    const reply = rowWith(rows, "@bob")
    expect(rows[reply]!.slice(3).trimEnd()).toBe("    └ @bob 2h [pending]")
    expect(rows[reply + 1]!.indexOf("body of r2")).toBe(3 + 2 + 6)

    const own = rowWith(rows, "@you")
    expect(rows[own]!.slice(3).trimEnd()).toBe("    └ @you 5m [synced]")
    expect(rows.join("\n")).not.toContain("@@you")
  })

  test("names the file in the divider when the panel shows all files", async () => {
    const { rows } = await mountPanel({ comments: thread, scopeFilename: null })
    expect(rows[rowWith(rows, "─ greet.ts:3")]!.trim()).toBe("─ greet.ts:3")
    expect(rows[0]).toContain("all files")
  })

  test("colours each status, the edit marks, the authors and the caret", async () => {
    const { rows, spans } = await mountPanel({ comments: thread, editingId: "r1" })
    expect(fgOf(rows, spans, "[local]")).toEqual(ints(colors.commentLocal))
    expect(fgOf(rows, spans, "[pending]")).toEqual(ints(colors.commentPending))
    expect(fgOf(rows, spans, "[synced]")).toEqual(ints(colors.commentSynced))
    expect(fgOf(rows, spans, "*edited")).toEqual(ints(colors.commentPending))
    expect(fgOf(rows, spans, "(editing)")).toEqual(ints(theme.yellow))
    expect(fgOf(rows, spans, "@alice")).toEqual(ints(theme.blue))
    expect(fgOf(rows, spans, " 3d")).toEqual(ints(theme.overlay0))
    expect(fgOf(rows, spans, "└")).toEqual(ints(colors.textDim))
    expect(fgOf(rows, spans, "▸")).toEqual(ints(theme.blue))
    expect(fgOf(rows, spans, "─ line 3")).toEqual(ints(theme.overlay0))
  })

  test("sets the highlighted comment on surface0, the others on mantle", async () => {
    const { rows, spans } = await mountPanel({ comments: thread, highlightedIndex: 1 })
    const reply = rowWith(rows, "@bob")
    expect(rows[reply]).toContain("▸ └ @bob")
    expect(bgAt(spans, rows[reply]!.indexOf("@bob"), reply)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, rows[reply + 1]!.indexOf("body"), reply + 1)).toEqual(ints(theme.surface0))
    const root = rowWith(rows, "@alice")
    expect(rows[root]!.slice(3, 5)).toBe("  ")
    expect(bgAt(spans, rows[root]!.indexOf("@alice"), root)).toEqual(ints(theme.mantle))
  })

  test("marks the thread outdated and unseen on its divider row", async () => {
    const outdated = [comment("o1", 7, { outdated: true }), comment("o2", 7, { inReplyTo: "o1" })]
    const { rows, spans } = await mountPanel({ comments: outdated, unseenIds: new Set(["o2"]) })
    const divider = rowWith(rows, "─ line 7")
    expect(rows[divider]).toMatch(/─ line 7\s+⊘  ●$/)
    expect(fgOf(rows, spans, "⊘")).toEqual(ints(theme.peach))
    expect(fgOf(rows, spans, "●")).toEqual(ints(theme.blue))
  })

  test("names a body's images and shows its reactions", async () => {
    const pictured = [
      comment("p1", 3, {
        body: "see\n\n![before](https://example.com/a.png)\n\n![after](https://example.com/b.png)",
        reactions: [{ content: "+1", count: 2, viewerHasReacted: false }],
      }),
      comment("p2", 3, { inReplyTo: "p1", body: "![shot](https://example.com/c.png)" }),
    ]
    const { rows, spans } = await mountPanel({ comments: pictured })
    const first = rowWith(rows, "▣ 1. before")
    expect(rows[first]!.indexOf("▣")).toBe(3 + 4)
    expect(rows[first + 1]!.trim()).toBe("▣ 2. after")
    expect(fgOf(rows, spans, "▣")).toEqual(ints(theme.overlay0))
    expect(fgOf(rows, spans, "before")).toEqual(ints(theme.sapphire))

    const reactions = rowWith(rows, "👍 2")
    expect(reactions).toBeGreaterThan(first + 1)
    expect(fgOf(rows, spans, "👍 2")).toEqual(ints(theme.subtext1))

    const single = rowWith(rows, "▣ shot")
    expect(rows[single]!.indexOf("▣")).toBe(3 + 2 + 6)
  })
})

describe("the thread panel's collapsed thread", () => {
  const resolved = (count: number, fields: Partial<Comment> = {}) =>
    Array.from({ length: count }, (_, i) =>
      comment(`c${i}`, 5, { inReplyTo: i === 0 ? undefined : "c0", isThreadResolved: i === 0 ? true : undefined, ...fields })
    )

  test("is one header row: caret, divider, author and the resolved count", async () => {
    const { rows } = await mountPanel({ comments: [comment("x1", 1), ...resolved(3)], highlightedIndex: 3 })
    const header = rowWith(rows, "─ line 5")
    expect(rows[header]!.slice(3)).toMatch(/^ {2}─ line 5\s+@alice {2}✓ 3$/)
    expect(rows.join("\n")).not.toContain("body of c0")
  })

  test("drops the count for a lone comment", async () => {
    const { rows, spans } = await mountPanel({ comments: resolved(1) })
    expect(rows[rowWith(rows, "─ line 5")]).toMatch(/@alice {2}✓$/)
    expect(fgOf(rows, spans, "✓")).toEqual(ints(theme.green))
  })

  test("counts an unresolved thread folded by hand with ⋯", async () => {
    const open = [comment("u1", 5), comment("u2", 5, { inReplyTo: "u1" })]
    const { rows, spans } = await mountPanel({ comments: open, expandedThreadIds: new Set(["u1"]) })
    expect(rows[rowWith(rows, "─ line 5")]).toMatch(/@alice {2}⋯ 2$/)
    expect(fgOf(rows, spans, "⋯")).toEqual(ints(theme.overlay0))

    const lone = await mountPanel({ comments: [comment("u1", 5)], expandedThreadIds: new Set(["u1"]) })
    expect(lone.rows[rowWith(lone.rows, "─ line 5")]).toMatch(/@alice {2}⋯$/)
  })

  test("adds outdated and unseen after the count", async () => {
    const { rows } = await mountPanel({ comments: resolved(2, { outdated: true }), unseenIds: new Set(["c1"]) })
    expect(rows[rowWith(rows, "─ line 5")]).toMatch(/@alice {2}✓ 2 {2}⊘ {2}●$/)
  })

  test("is surface0 with a blue caret while highlighted, mantle and blank otherwise", async () => {
    const highlighted = await mountPanel({ comments: resolved(2) })
    const y = rowWith(highlighted.rows, "─ line 5")
    expect(highlighted.rows[y]!.slice(3, 5)).toBe("▸ ")
    expect(fgAt(highlighted.spans, 3, y)).toEqual(ints(theme.blue))
    expect(bgAt(highlighted.spans, highlighted.rows[y]!.indexOf("─"), y)).toEqual(ints(theme.surface0))
    expect(fgOf(highlighted.rows, highlighted.spans, "@alice")).toEqual(ints(theme.blue))

    const other = await mountPanel({ comments: [comment("x1", 1), ...resolved(2)] })
    const z = rowWith(other.rows, "─ line 5")
    expect(other.rows[z]!.slice(3, 5)).toBe("  ")
    expect(bgAt(other.spans, other.rows[z]!.indexOf("─"), z)).toEqual(ints(theme.mantle))
  })
})

describe("the thread panel's flash labels", () => {
  test("take the caret's cell on a comment row and on a collapsed header", async () => {
    const comments = [
      comment("a1", 1),
      comment("a2", 1, { inReplyTo: "a1", author: "bob" }),
      comment("z1", 9, { isThreadResolved: true, author: "carol" }),
    ]
    const flashLabels = new Map([["a2", "f"], ["z1", "gh"]])
    const { rows, spans } = await mountPanel({ comments, flashLabels })
    const reply = rowWith(rows, "@bob")
    expect(rows[reply]!.slice(5)).toMatch(/^f └ @bob/)
    expect(fgAt(spans, 5, reply)).toEqual(ints(colors.flashLabel))

    const header = rowWith(rows, "─ line 9")
    expect(rows[header]!.slice(3)).toMatch(/^gh─ line 9/)
    expect(fgAt(spans, 3, header)).toEqual(ints(colors.flashLabel))

    // The highlighted root keeps its caret: only labelled rows lose it.
    expect(rows[rowWith(rows, "@alice")]!.slice(3, 5)).toBe("▸ ")
  })
})

describe("the thread panel's header", () => {
  test("names the file and counts its comments", async () => {
    const one = await mountPanel({ comments: [comment("a1", 1)] })
    expect(one.rows[0]!.trim()).toMatch(/^greet\.ts\s+1 comment$/)
    expect(fgAt(one.spans, one.rows[0]!.indexOf("1 comment"), 0)).toEqual(ints(theme.overlay0))

    const two = await mountPanel({ comments: [comment("a1", 1), comment("b1", 2)] })
    expect(two.rows[0]!.trim()).toMatch(/^greet\.ts\s+2 comments$/)

    const none = await mountPanel({ comments: [] })
    expect(none.rows[0]!.trim()).toMatch(/^greet\.ts\s+0 comments$/)
  })

  test("keeps an accepted filter beside the name", async () => {
    const { rows } = await mountPanel({ comments: [comment("a1", 1)], filter: "nit" })
    expect(rows[0]!.trim()).toMatch(/^greet\.ts {2}\/nit\s+1 comment$/)
  })

  test("says Composing or Editing in place of the count", async () => {
    const composing = await mountPanel({ comments: [comment("a1", 1)], mode: "compose" })
    expect(composing.rows[0]!.trim()).toMatch(/^greet\.ts\s+Composing$/)
    const editing = await mountPanel({ comments: [comment("a1", 1)], mode: "edit", editingId: "a1" })
    expect(editing.rows[0]!.trim()).toMatch(/^greet\.ts\s+Editing$/)
  })
})

describe("the thread panel's key hints", () => {
  const plain = comment("a1", 3)
  const hunk = "@@ -1,3 +1,3 @@\n a\n-b\n+c"

  test("offer focus and close while unfocused", async () => {
    const { rows, spans } = await mountPanel({ comments: [plain] }, WIDE)
    expect(hintRow(rows)).toBe("Ctrl-l focus  Ctrl-t close")
    const y = rows.length - 1
    expect(fgAt(spans, rows[y]!.indexOf("Ctrl-l"), y)).toEqual(ints(theme.yellow))
    expect(fgAt(spans, rows[y]!.indexOf("focus"), y)).toEqual(ints(theme.subtext0))
  })

  test("offer a new comment and the way out on an empty panel", async () => {
    const { rows } = await mountPanel({ focused: true }, WIDE)
    expect(hintRow(rows)).toBe("n new  Ctrl-h diff  Ctrl-e expand  q close")
  })

  test("offer resuming a draft", async () => {
    const { rows } = await mountPanel({ focused: true, draft: "half a thought" }, WIDE)
    expect(hintRow(rows)).toBe("n draft  Ctrl-h diff  Ctrl-e expand  q close")
  })

  test("offer the thread keys, with code and image only when the highlighted comment has them", async () => {
    const bare = await mountPanel({ focused: true, comments: [plain] }, WIDE)
    expect(hintRow(bare.rows)).toBe(
      "n new  j/k nav  za fold  r reply  e edit  d del  x resolve  o open  Ctrl-h diff  Ctrl-e expand  q close"
    )

    const rich = await mountPanel(
      {
        focused: true,
        comments: [comment("a1", 3, { diffHunk: hunk, body: "![x](https://example.com/x.png)" })],
      },
      WIDE
    )
    expect(hintRow(rich.rows)).toBe(
      "n new  j/k nav  za fold  r reply  e edit  d del  x resolve  o open  c code  O image  Ctrl-h diff  Ctrl-e expand  q close"
    )
  })

  test("offer submit only in a PR, on a local or edited comment", async () => {
    const local = comment("a1", 3, { status: "local" })
    const edited = comment("a1", 3, { localEdit: "changed" })
    const submit = "o open  S submit  Ctrl-h"

    expect(hintRow((await mountPanel({ focused: true, appMode: "pr", comments: [local] }, WIDE)).rows)).toContain(submit)
    expect(hintRow((await mountPanel({ focused: true, appMode: "pr", comments: [edited] }, WIDE)).rows)).toContain(submit)
    expect(hintRow((await mountPanel({ focused: true, appMode: "local", comments: [local] }, WIDE)).rows)).not.toContain("S submit")
    expect(hintRow((await mountPanel({ focused: true, appMode: "pr", comments: [plain] }, WIDE)).rows)).not.toContain("S submit")
  })
})

describe("the thread panel's composer label", () => {
  const onLine3 = comment("a1", 3)

  test("says what is being written, and where", async () => {
    const cases: [Partial<ThreadPanelInput>, string][] = [
      [{ mode: "edit", editingId: "a1" }, "Editing comment"],
      [{ mode: "compose", note: true }, "Note @ greet.ts:3 — local only, never published"],
      [{ mode: "compose", replyToThread: true }, "Reply @ greet.ts:3"],
      [{ mode: "compose" }, "New thread @ greet.ts:3"],
      [{ mode: "compose", line: 8 }, "New comment @ greet.ts:8"],
      [{ mode: "compose", composeFilename: "src/other.ts" }, "New comment @ other.ts:3"],
    ]
    for (const [props, label] of cases) {
      const { rows } = await mountPanel({ comments: [onLine3], ...props }, WIDE)
      expect(rows[rowWith(rows, label)]!.trim()).toBe(label)
    }
  })
})

describe("the thread panel's pickers", () => {
  const composing = { comments: [comment("a1", 3)], mode: "compose" as const }

  test("list the emoji a shortcode finds, the selected one marked", async () => {
    const { rows, spans } = await mountPanel({ ...composing, emojiPicker: { query: "smi", selectedIndex: 1, colonOffset: 0 } })
    const title = rowWith(rows, ":emoji")
    expect(fgOf(rows, spans, ":emoji")).toEqual(ints(theme.yellow))
    expect(rows[title + 1]).toMatch(/ {2}😄 {2}:smile:/)
    expect(rows[title + 2]).toMatch(/▸ 😃 {2}:smiley:/)
    expect(bgAt(spans, rows[title + 2]!.indexOf(":smiley:"), title + 2)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, rows[title + 2]!.indexOf("▸"), title + 2)).toEqual(ints(theme.yellow))
    expect(rows[rowWith(rows, "↑↓ nav")]!.trim()).toBe("↑↓ nav  Tab/⏎ accept  Esc dismiss")
  })

  test("clamp the emoji selection to what was found", async () => {
    const { rows } = await mountPanel({ ...composing, emojiPicker: { query: "tada", selectedIndex: 5, colonOffset: 0 } })
    expect(rows[rowWith(rows, ":tada:")]).toContain("▸ 🎉")
  })

  test("say when no emoji matches", async () => {
    const { rows, spans } = await mountPanel({ ...composing, emojiPicker: { query: "zzzq", selectedIndex: 0, colonOffset: 0 } })
    expect(rows[rowWith(rows, "No emoji for :zzzq")]!.trim()).toBe("No emoji for :zzzq")
    expect(fgOf(rows, spans, "No emoji")).toEqual(ints(theme.overlay0))
  })

  test("clamp the mention selection to the names left", async () => {
    const { rows } = await mountPanel({
      ...composing,
      mentionPicker: { query: "bo", selectedIndex: 4, atOffset: 0 },
      mentionCandidates: ["alice", "bob"],
    })
    expect(rows[rowWith(rows, "@bob")]).toContain("▸ @bob")
  })

  test("say why the mention picker is empty", async () => {
    const cases: [Partial<ThreadPanelInput>, string][] = [
      [{ mentionPicker: { query: "", selectedIndex: 0, atOffset: 0 } }, "No participants to mention"],
      [{ mentionPicker: { query: "zed", selectedIndex: 0, atOffset: 0 }, mentionSearchQuery: "zed" }, "Searching GitHub for @zed…"],
      [{ mentionPicker: { query: "zed", selectedIndex: 0, atOffset: 0 }, mentionSearchQuery: "ze" }, "No match for @zed"],
    ]
    for (const [props, text] of cases) {
      const { rows, spans } = await mountPanel({ ...composing, ...props })
      expect(rows[rowWith(rows, text)]!.trim()).toBe(text)
      expect(fgOf(rows, spans, text)).toEqual(ints(theme.overlay0))
    }
  })
})

describe("the thread panel's empty state", () => {
  test("says the file has no comments yet", async () => {
    const { rows, spans } = await mountPanel({ comments: [] })
    const y = rowWith(rows, "No comments in this file yet.")
    expect(rows[y]!.indexOf("No comments")).toBe(3)
    expect(fgOf(rows, spans, "No comments")).toEqual(ints(theme.overlay0))
  })
})
