import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createFeedIsland } from "./feed"
import { feedModel, type FeedModel } from "../components/feed-model"
import { PromptInput, endPromptSession, syncPromptSession } from "../components/PromptInput"
import { findText, paintOf } from "../testing/frame"
import { createFeedState, type CommitFileSummary, type FeedRow, type FeedState } from "../state"
import type { FeedEvent } from "../utils/feed"

const NOW = Date.parse("2026-03-01T12:00:00Z")
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

let setup: TestRendererSetup | null = null

afterEach(() => {
  endPromptSession()
  setup?.renderer.destroy()
  setup = null
})

const EVENTS: FeedEvent[] = [
  { id: "c1", type: "comment", at: ago(5), actor: "alice", lead: "src/a.ts:3", title: "Rename this", target: { kind: "comment", commentId: "c1" } },
  { id: "c2", type: "comment", at: ago(5), actor: "bob", lead: "src/b.ts:9", title: "Typo", resolved: true, target: { kind: "comment", commentId: "c2" } },
  { id: "r1", type: "review", at: ago(180), actor: "carol", title: "approved", note: "LGTM" },
  { id: "commit-abc", type: "commit", at: ago(60 * 26), actor: "dave", lead: "abc", title: "fix: hunks", trailing: "✓ 3/3", target: { kind: "commit", sha: "abc" } },
  { id: "k1", type: "check", at: ago(60 * 27), title: "build", trailing: "✗ failed", target: { kind: "check", url: null } },
]
// Titles and notes too long for their row, which the row has to cut.
const LONG: FeedEvent[] = EVENTS.map((event, i) => ({
  ...event,
  lead: event.lead ? `src/some/rather/long/path/number/${i}/${event.lead}` : undefined,
  title: `${event.title} ${"and more words ".repeat(i + 2)}`,
  note: i % 2 === 0 ? `a note that also runs on ${"and on ".repeat(i + 1)}` : undefined,
}))
const FILES: CommitFileSummary[] = [
  { filename: "src/diff.ts", additions: 12, deletions: 3 },
  { filename: "src/diff.test.ts", additions: 40, deletions: 0 },
]

function model(events: FeedEvent[], over: Partial<FeedState> = {}, extra: { unseen?: string[]; flash?: [number, string][]; loading?: boolean } = {}): FeedModel {
  const feed: FeedState = { ...createFeedState(), events, ...over }
  const rows = events.flatMap((event): FeedRow[] => {
    const target = event.target
    if (target?.kind !== "commit" || !feed.expandedIds.has(event.id)) return [{ kind: "event", event }]
    const files = feed.commitFiles.get(target.sha) ?? []
    return [
      { kind: "event", event },
      ...files.map((file, i) => ({ kind: "file" as const, event, sha: target.sha, file, last: i === files.length - 1 })),
    ]
  })
  return feedModel({
    events,
    rows,
    feed,
    unseenIds: new Set(extra.unseen ?? []),
    flashLabels: new Map((extra.flash ?? []).map(([i, label]) => [String(i), label])),
    loading: extra.loading ?? false,
    now: NOW,
  })
}

const expanded = new Set(["commit-abc"])
const withFiles = new Map([["abc", FILES]])

/** Empty, mixed, a commit opened and filled, the filter typed and put away, the selection moved, rows cut short; null hides the feed. */
const CYCLE: (FeedModel | null)[] = [
  model([], {}, { loading: true }),
  model(EVENTS, {}, { unseen: ["c1"] }),
  model(EVENTS, { expandedIds: expanded, highlightIndex: 3 }),
  model(EVENTS, { expandedIds: expanded, commitFiles: withFiles, highlightIndex: 3 }),
  model(EVENTS, { expandedIds: expanded, commitFiles: withFiles, highlightIndex: 5 }, { flash: [[1, "a"], [4, "s"]] }),
  model(EVENTS, { expandedIds: expanded, commitFiles: withFiles, filterInput: true, filter: "fix" }),
  null,
  model(EVENTS.slice(3), { filter: "fix", types: new Set(["commit"]) }),
  model(EVENTS, { highlightIndex: 2, unseenOnly: true }, { unseen: ["c2"] }),
  model([], { filter: "zzz" }),
  null,
  model(EVENTS, { highlightIndex: 4 }),
  model(LONG, { highlightIndex: 1 }),
  model(LONG.slice(1), { highlightIndex: 0 }, { unseen: ["c2"] }),
  model(EVENTS, { highlightIndex: 1 }),
  model(LONG, { expandedIds: expanded, commitFiles: withFiles, highlightIndex: 4, types: new Set(["comment", "review", "check"]) }),
]

/** A full-size parent, as render.ts's content row is, for the host to fill. */
function mount(screen: TestRendererSetup, host: BoxRenderable) {
  const parent = new BoxRenderable(screen.renderer, { width: "100%", height: "100%" })
  screen.renderer.root.add(parent)
  parent.add(host)
}

async function painted(screen: TestRendererSetup) {
  await screen.renderOnce()
  await screen.renderOnce()
  return { chars: screen.captureCharFrame(), paint: paintOf(screen.captureSpans()) }
}

async function freshPaint(next: FeedModel | null) {
  const screen = await createTestRenderer({ width: 100, height: 30 })
  const island = createFeedIsland(screen.renderer)
  mount(screen, island.host)
  island.update(next)
  const result = await painted(screen)
  island.dispose()
  screen.renderer.destroy()
  return result
}

test("one island cycled through every model draws what a fresh island draws", async () => {
  setup = await createTestRenderer({ width: 100, height: 30 })
  const island = createFeedIsland(setup.renderer)
  mount(setup, island.host)

  for (const [step, next] of CYCLE.entries()) {
    island.update(next)
    const cycled = await painted(setup)
    expect(cycled.chars.includes("Feed")).toBe(next !== null)
    const fresh = await freshPaint(next)
    expect({ step, chars: cycled.chars }).toEqual({ step, chars: fresh.chars })
    expect({ step, paint: cycled.paint }).toEqual({ step, paint: fresh.paint })
  }
  island.dispose()
})

test("keeps one feed-filter field across updates, mounted and undestroyed", async () => {
  setup = await createTestRenderer({ width: 100, height: 30 })
  const island = createFeedIsland(setup.renderer)
  mount(setup, island.host)
  const field = PromptInput(setup.renderer, "feed-filter")

  syncPromptSession({ renderer: setup.renderer, key: "feed-filter", initialValue: "fix", onChange: () => {} })
  island.update(model(EVENTS, { filterInput: true, filter: "fix" }))
  expect((await painted(setup)).chars).toContain("/fix")
  const parent = field.parent

  endPromptSession()
  island.update(model(EVENTS, { filter: "fix" }))
  await painted(setup)
  island.update(null)
  await painted(setup)
  // Solid destroys what it removes on the next tick.
  await new Promise((resolve) => setTimeout(resolve, 10))

  syncPromptSession({ renderer: setup.renderer, key: "feed-filter", initialValue: "hunk", onChange: () => {} })
  island.update(model(EVENTS, { filterInput: true, filter: "hunk" }))
  expect((await painted(setup)).chars).toContain("/hunk")
  expect(PromptInput(setup.renderer, "feed-filter")).toBe(field)
  expect(field.isDestroyed).toBe(false)
  expect(field.parent).toBe(parent)
  island.dispose()
})

test("moving the selection keeps the rows' renderables", async () => {
  setup = await createTestRenderer({ width: 100, height: 30 })
  const island = createFeedIsland(setup.renderer)
  mount(setup, island.host)

  island.update(model(EVENTS))
  await painted(setup)
  const title = findText(island.host, "approved")
  expect(title).toBeDefined()
  island.update(model(EVENTS, { highlightIndex: 2 }))
  await painted(setup)
  expect(findText(island.host, "approved")).toBe(title!)
  island.dispose()
})
