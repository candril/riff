import { test, expect, describe } from "bun:test"
import { feedModel, fitLeft, fitRight, leadWidthFor, timeAgo, type FeedEventRow, type FeedModelInput } from "./feed-model"
import { emptyFeed, type CommitFileSummary, type FeedRow, type FeedState } from "../features/feed/types"
import type { FeedEvent } from "../utils/feed"

const NOW = Date.parse("2026-03-01T12:00:00Z")
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

function event(id: string, minutes: number, extra: Partial<FeedEvent> = {}): FeedEvent {
  return { id, type: "comment", at: ago(minutes), title: id, target: { kind: "comment", commentId: id }, ...extra }
}

const commit = (sha: string, minutes = 0): FeedEvent =>
  event(`commit-${sha}`, minutes, { type: "commit", lead: sha, target: { kind: "commit", sha } })

function model(events: FeedEvent[], over: Partial<FeedState> = {}, input: Partial<FeedModelInput> = {}) {
  const feed: FeedState = { ...emptyFeed(), events, ...over }
  const rows = events.flatMap((e): FeedRow[] => {
    const target = e.target
    if (target?.kind !== "commit" || !feed.expandedIds.has(e.id)) return [{ kind: "event", event: e }]
    const files = feed.commitFiles.get(target.sha) ?? []
    return [
      { kind: "event", event: e },
      ...files.map((file, i) => ({ kind: "file" as const, event: e, sha: target.sha, file, last: i === files.length - 1 })),
    ]
  })
  return feedModel({ events, rows, feed, unseenIds: new Set(), flashLabels: new Map(), loading: false, now: NOW, height: 30, ...input })
}

const eventRows = (m: ReturnType<typeof feedModel>) => m.rows.filter((r): r is FeedEventRow => r.kind === "event")

describe("the time gutter", () => {
  test("counts back from the clock it is given", () => {
    expect(timeAgo(ago(0), NOW)).toBe("now")
    expect(timeAgo(ago(59), NOW)).toBe("59m")
    expect(timeAgo(ago(60 * 5), NOW)).toBe("5h")
    expect(timeAgo(ago(60 * 24 * 3), NOW)).toBe("3d")
    expect(timeAgo(ago(60 * 24 * 45), NOW)).toBe("1mo")
    expect(timeAgo(ago(60 * 24 * 400), NOW)).toBe("1y")
    expect(timeAgo("not a date", NOW)).toBe("")
  })

  test("is blank where the time repeats the event above, files in between or not", () => {
    const files: CommitFileSummary[] = [{ filename: "a.ts", additions: 1, deletions: 0 }]
    const m = model([event("a", 5), event("b", 5), commit("abc", 5), event("c", 5), event("d", 120)], {
      expandedIds: new Set(["commit-abc"]),
      commitFiles: new Map([["abc", files]]),
    })
    expect(eventRows(m).map((r) => r.timeCell)).toEqual(["  5m", "    ", "    ", "    ", "  2h"])
  })
})

describe("a feed longer than the screen", () => {
  const events = Array.from({ length: 40 }, (_, i) => event(`e${i}`, 5))

  test("holds only the rows in view", () => {
    const m = model(events, { highlightIndex: 39 }, { height: 16 })
    expect(m.rows.map((r) => r.key)).toEqual(Array.from({ length: 10 }, (_, i) => `e${30 + i}`))
  })

  test("writes the time on the top row in view, though the event scrolled away above it shares it", () => {
    const m = model(events, { highlightIndex: 39 }, { height: 16 })
    expect(eventRows(m).map((r) => r.timeCell)).toEqual(["  5m", ...Array(9).fill("    ")])
  })
})

describe("event rows", () => {
  test("mark a commit's fold open or closed in front of its sha", () => {
    const m = model([commit("abc"), commit("def")], { expandedIds: new Set(["commit-abc"]), commitFiles: new Map([["abc", []]]) })
    expect(eventRows(m).map((r) => r.leadCell.trimEnd())).toEqual(["▾ abc", "▸ def"])
  })

  test("say unseen before resolved, and nothing otherwise", () => {
    const m = model([event("a", 0), event("b", 0, { resolved: true }), event("c", 0, { resolved: true }), event("d", 0)], {}, {
      unseenIds: new Set(["a", "b"]),
    })
    expect(eventRows(m).map((r) => r.state)).toEqual(["unseen", "unseen", "resolved", "none"])
  })

  test("dim a resolved title, and draw the selected one in the text colour", () => {
    const m = model([event("a", 0, { resolved: true }), event("b", 0, { resolved: true }), event("c", 0)], { highlightIndex: 0 })
    expect(eventRows(m).map((r) => r.titleTone)).toEqual(["text", "dim", "subtext1"])
  })

  test("tone a trailing result by its mark", () => {
    const m = model([
      event("a", 0, { trailing: "✓ passed" }),
      event("b", 0, { trailing: "✗ failed" }),
      event("c", 0, { trailing: "pending" }),
      event("d", 0),
    ])
    expect(eventRows(m).map((r) => [r.trailing, r.trailingTone])).toEqual([
      ["✓ passed", "green"],
      ["✗ failed", "red"],
      ["pending", "dim"],
      [null, "dim"],
    ])
  })

  test("prefix an actor with @ once", () => {
    const m = model([event("a", 0, { actor: "octo" }), event("b", 0, { actor: "@you" }), event("c", 0)])
    expect(eventRows(m).map((r) => r.actorCell.trimEnd())).toEqual(["@octo", "@you", ""])
  })
})

describe("cutting", () => {
  test("cuts an actor from the right and a lead from the left, wide glyphs counted as two cells", () => {
    expect(fitRight("@a-very-long-username", 13)).toBe("@a-very-long…")
    expect(fitRight("@日本語日本語日本語", 13)).toBe("@日本語日本… ")
    expect(Bun.stringWidth(fitRight("@日本語日本語日本語", 13))).toBe(13)
    expect(fitLeft("src/deeply/nested/file.ts:4", 12)).toBe("…d/file.ts:4")
    expect(fitLeft("日本語/日本語.ts", 10)).toBe("…日本語.ts")
    expect(Bun.stringWidth(fitLeft("日本語/日本語.ts", 10))).toBe(10)
    expect(fitLeft("short", 8)).toBe("short   ")
  })

  test("sizes the lead column to the widest lead, fold included, between 8 and 36", () => {
    expect(leadWidthFor([event("a", 0)])).toBe(8)
    expect(leadWidthFor([event("a", 0, { lead: "src/a.ts:12" })])).toBe(11)
    expect(leadWidthFor([commit("abcdef1234")])).toBe(12)
    expect(leadWidthFor([event("a", 0, { lead: "x".repeat(70) })])).toBe(36)
  })
})

describe("opened commits", () => {
  test("show a loading row only while their files are missing", () => {
    const waiting = model([commit("abc"), event("b", 0)], { expandedIds: new Set(["commit-abc"]) })
    expect(waiting.rows.map((r) => r.key)).toEqual(["commit-abc", "commit-abc:loading", "b"])

    const files: CommitFileSummary[] = [
      { filename: "a.ts", additions: 2, deletions: 1 },
      { filename: "b.ts", additions: 0, deletions: 4 },
    ]
    const loaded = model([commit("abc"), event("b", 0)], {
      expandedIds: new Set(["commit-abc"]),
      commitFiles: new Map([["abc", files]]),
    })
    expect(loaded.rows).toMatchObject([
      { kind: "event", key: "commit-abc" },
      { kind: "file", key: "commit-abc:a.ts", branch: "├", filename: "a.ts", additions: 2, deletions: 1 },
      { kind: "file", key: "commit-abc:b.ts", branch: "└", filename: "b.ts", additions: 0, deletions: 4 },
      { kind: "event", key: "b" },
    ])

    const closed = model([commit("abc")], { commitFiles: new Map() })
    expect(closed.rows.map((r) => r.kind)).toEqual(["event"])
  })
})

describe("selection and flash labels", () => {
  test("follow the drawn row index, file rows counted and loading rows not", () => {
    const files: CommitFileSummary[] = [{ filename: "a.ts", additions: 1, deletions: 1 }]
    const events = [commit("abc"), commit("def"), event("c", 0)]
    const over = { expandedIds: new Set(["commit-abc", "commit-def"]), commitFiles: new Map([["abc", files]]) }

    const onFile = model(events, { ...over, highlightIndex: 1 }, { flashLabels: new Map([["1", "a"], ["3", "s"]]) })
    const selectable = onFile.rows.filter((r) => r.kind !== "loading")
    expect(selectable.map((r) => r.selected)).toEqual([false, true, false, false])
    expect(selectable.map((r) => r.flashCell)).toEqual(["  ", "a ", "  ", "s "])
    expect(onFile.rows.map((r) => r.key)).toEqual(["commit-abc", "commit-abc:a.ts", "commit-def", "commit-def:loading", "c"])

    const onEvent = model(events, { ...over, highlightIndex: 3 })
    expect(onEvent.rows.filter((r) => r.kind !== "loading").map((r) => r.selected)).toEqual([false, false, false, true])
  })
})

describe("the header, legend and empty message", () => {
  test("count the events, the unseen ones and the scope", () => {
    const m = model([event("a", 0), event("b", 0)], { types: new Set(["comment", "review"]) }, { unseenIds: new Set(["b"]), loading: true })
    expect(m.header).toEqual({ countText: "2 events", scope: "comment · review", loadingSuffix: " · loading", unseenCount: 1 })
    expect(model([event("a", 0)]).header).toMatchObject({ countText: "1 event", scope: "all types", loadingSuffix: "" })
  })

  test("lists every toggle with the unseen one last, and says when it is narrowed", () => {
    const plain = model([]).legend
    expect(plain.toggles.map((t) => t.key)).toEqual(["c", "m", "r", "b", "t", "p", "u"])
    expect(plain.toggles.every((t) => !t.on)).toBe(true)
    expect(plain.narrowed).toBe(false)

    const narrowed = model([], { types: new Set(["resolved"]), unseenOnly: true, filterInput: true, filter: "x" }).legend
    expect(narrowed.toggles.filter((t) => t.on).map((t) => t.label)).toEqual(["resolved", "unseen"])
    expect(narrowed).toMatchObject({ narrowed: true, filter: "x", filterInput: true })
    expect(model([], { filter: "x" }).legend.narrowed).toBe(true)
  })

  test("says it is loading or that nothing matches, and nothing once there are events", () => {
    expect(model([], {}, { loading: true }).empty).toBe("Reading the timeline…")
    expect(model([]).empty).toBe("Nothing matches — `0` shows everything")
    expect(model([event("a", 0)]).empty).toBeNull()
  })
})
