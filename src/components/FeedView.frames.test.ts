import { test, expect, describe, afterEach, beforeAll, afterAll, setSystemTime } from "bun:test"
import { feedModel } from "./feed-model"
import { createFeedIsland } from "../app/feed"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { colors, theme } from "../theme"
import { createFeedState, type CommitFileSummary, type FeedRow, type FeedState } from "../state"
import type { FeedEvent } from "../utils/feed"

/*
 * The feed on a 100x30 screen, padded by two cells on each side and one on
 * top: the header is row 1, the legend row 2, the spacer row 3, the rows from
 * row 4. Every row starts with the two-cell flash gutter at column 2.
 */

const NOW = new Date("2026-03-01T12:00:00Z")
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString()

beforeAll(() => setSystemTime(NOW))
afterAll(() => setSystemTime())

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

interface Show {
  events: FeedEvent[]
  feed?: Partial<FeedState>
  unseen?: string[]
  flash?: [number, string][]
  loading?: boolean
  height?: number
  width?: number
  /** Typed into the feed filter's field before the frame is taken. */
  typed?: string
}

/** The rows as visibleFeedRows builds them: a commit's files under it once it is open. */
function rowsOf(events: FeedEvent[], feed: FeedState): FeedRow[] {
  return events.flatMap((event): FeedRow[] => {
    const target = event.target
    if (target?.kind !== "commit" || !feed.expandedIds.has(event.id)) return [{ kind: "event", event }]
    const files = feed.commitFiles.get(target.sha) ?? []
    return [
      { kind: "event", event },
      ...files.map((file, index) => ({ kind: "file" as const, event, sha: target.sha, file, last: index === files.length - 1 })),
    ]
  })
}

async function show({ events, feed: over = {}, unseen = [], flash = [], loading = false, height = 30, width = 100, typed }: Show) {
  const feed: FeedState = { ...createFeedState(), events, ...over }
  mounted = await mountRenderable(
    (renderer) => {
      const island = createFeedIsland(renderer)
      if (typed !== undefined) {
        island.prompt({ key: "feed-filter", initialValue: typed, placeholder: "filter the feed…", onChange: () => {} })
      }
      island.update(
        feedModel({
          events,
          rows: rowsOf(events, feed),
          feed,
          unseenIds: new Set(unseen),
          flashLabels: new Map(flash.map(([index, label]) => [String(index), label])),
          loading,
          now: Date.now(),
          height,
        })
      )
      return island.host
    },
    { width, height }
  )
  const lines = (await mounted.frame()).split("\n")
  return { lines, spans: mounted.setup.captureSpans() }
}

const SPACER = ""
// The legend is wider than the 96 cells it gets, so the gaps between its
// entries give way, a cell here and there.
const LEGEND_ALL = "   c commits   m comments   r reviews   b checks    t resolved   p pushes   u unseen   / filter"

const comment = (id: string, minutes: number, extra: Partial<FeedEvent> = {}): FeedEvent => ({
  id,
  type: "comment",
  at: ago(minutes),
  actor: "alice",
  lead: "src/greet.ts:12",
  title: "Rename this",
  target: { kind: "comment", commentId: id },
  ...extra,
})

const commit = (sha: string, minutes: number, extra: Partial<FeedEvent> = {}): FeedEvent => ({
  id: `commit-${sha}`,
  type: "commit",
  at: ago(minutes),
  actor: "dave",
  lead: sha,
  title: "fix: handle empty hunks",
  target: { kind: "commit", sha },
  ...extra,
})

const MIXED: FeedEvent[] = [
  comment("c1", 5),
  comment("c2", 5, {
    actor: "bob",
    lead: "src/very/long/path/to/some/deeply/nested/module/file.ts:40",
    title: "Typo",
    resolved: true,
  }),
  { id: "r1", type: "review", at: ago(180), actor: "carol", title: "approved", note: "LGTM overall" },
  { id: "k1", type: "check", at: ago(185), title: "build", trailing: "✓ passed", target: { kind: "check", url: null } },
  commit("abc1234", 60 * 26, { actor: "a-very-long-username-indeed", trailing: "✓ 3/3" }),
  commit("def5678", 60 * 27, { title: "feat: word diff", trailing: "✗ 1/3" }),
  { id: "p1", type: "push", at: ago(60 * 50), actor: "@you", title: "force-pushed" },
  { id: "y1", type: "ready", at: ago(60 * 24 * 40), actor: "erin", title: "marked ready for review" },
]

const FILES: CommitFileSummary[] = [
  { filename: "src/diff.ts", additions: 12, deletions: 3 },
  { filename: "src/diff.test.ts", additions: 40, deletions: 0 },
]
const many = Array.from({ length: 60 }, (_, i) => comment(`m${i}`, i * 61, { title: `Note ${i}` }))

/** Where `needle` first shows, as [column, row]. */
function find(lines: string[], needle: string, from = 0): [number, number] {
  for (let y = from; y < lines.length; y++) {
    const x = lines[y]!.indexOf(needle)
    if (x >= 0) return [x, y]
  }
  throw new Error(`"${needle}" is not on screen`)
}

describe("an empty feed", () => {
  test("says it is reading the timeline while it loads", async () => {
    const { lines, spans } = await show({ events: [], loading: true })
    expect(lines).toEqual([
      "",
      "  Feed   0 events · all types · loading",
      LEGEND_ALL,
      SPACER,
      "  Reading the timeline…",
    ])
    expect(fgAt(spans, 2, 1)).toEqual(ints(colors.headerFg))
    expect(fgAt(spans, 9, 1)).toEqual(ints(colors.textDim))
    expect(bgAt(spans, 2, 3)).toEqual(bgAt(spans, 0, 0)!)
    expect(fgAt(spans, 2, 4)).toEqual(ints(colors.textDim))
  })

  test("says how to see everything once the filters leave nothing", async () => {
    const { lines, spans } = await show({ events: [], feed: { filter: "zzz" } })
    expect(lines).toEqual([
      "",
      "  Feed   0 events · all types",
      "   c commits  m comments   r reviews  b checks   t resolved   p pushes  u unseen   / zzz   esc all",
      SPACER,
      "  Nothing matches — `0` shows everything",
    ])
    expect(fgAt(spans, ...find(lines, "zzz"))).toEqual(ints(colors.text))
    expect(fgAt(spans, ...find(lines, "esc all"))).toEqual(ints(colors.textDim))
    expect(fgAt(spans, 2, 4)).toEqual(ints(colors.textDim))
  })
})

describe("a feed of every kind of event", () => {
  let lines: string[]
  let spans: Awaited<ReturnType<typeof show>>["spans"]
  beforeAll(async () => {
    ;({ lines, spans } = await show({ events: MIXED, unseen: ["c1"] }))
  })
  afterAll(async () => {
    await mounted?.dispose()
    mounted = null
  })

  test("writes the time only where it changes, and cuts long actors and leads", () => {
    expect(lines).toEqual([
      "",
      "  Feed   8 events · all types  ● 1 unseen",
      LEGEND_ALL,
      SPACER,
      "      5m ● comment  @alice         src/greet.ts:12                       Rename this",
      "         ✓ comment  @bob           …ome/deeply/nested/module/file.ts:40  Typo",
      "      3h   review   @carol                                               approved  LGTM overall",
      "           check                                                         build            ✓ passed",
      "      1d   commit   @a-very-long…  ▸ abc1234                             fix: handle empty   ✓ 3/3",
      "           commit   @dave          ▸ def5678                             feat: word diff     ✗ 1/3",
      "      2d   push     @you                                                 force-pushed",
      "     1mo   ready    @erin                                                marked ready for review",
    ])
  })

  test("marks an unseen comment ● in blue and a resolved one ✓ in green", () => {
    expect(fgAt(spans, ...find(lines, "● 1 unseen"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, 9, 4)).toEqual(ints(theme.blue))
    expect(fgAt(spans, 9, 5)).toEqual(ints(theme.green))
  })

  test("colours each type, the actor, the lead and the time", () => {
    const typeAt = (row: number) => fgAt(spans, 11, row)
    expect(typeAt(4)).toEqual(ints(theme.mauve))
    expect(typeAt(6)).toEqual(ints(theme.green))
    expect(typeAt(7)).toEqual(ints(theme.yellow))
    expect(typeAt(8)).toEqual(ints(theme.peach))
    expect(typeAt(10)).toEqual(ints(theme.red))
    expect(typeAt(11)).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "@bob"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "…ome/deeply"))).toEqual(ints(colors.textDim))
    expect(fgAt(spans, ...find(lines, "▸ abc1234"))).toEqual(ints(colors.textDim))
    expect(fgAt(spans, ...find(lines, "3h"))).toEqual(ints(colors.textDim))
  })

  test("dims a resolved comment's words and a note, and colours a check result", () => {
    expect(fgAt(spans, ...find(lines, "Typo"))).toEqual(ints(colors.textDim))
    expect(fgAt(spans, ...find(lines, "approved"))).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "LGTM overall"))).toEqual(ints(colors.textDim))
    expect(fgAt(spans, ...find(lines, "✓ passed"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "✓ 3/3"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "✗ 1/3"))).toEqual(ints(theme.red))
  })

  test("marks the first row as selected, across the padded width, in the text colour", () => {
    expect(bgAt(spans, 2, 4)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 97, 4)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 1, 4)).toEqual(bgAt(spans, 0, 0)!)
    expect(bgAt(spans, 98, 4)).toEqual(bgAt(spans, 0, 0)!)
    expect(bgAt(spans, 2, 5)).toEqual(bgAt(spans, 0, 0)!)
    expect(fgAt(spans, ...find(lines, "Rename this"))).toEqual(ints(colors.text))
  })
})

describe("a commit opened into its files", () => {
  const events = MIXED.slice(4, 7)
  const expandedIds = new Set(["commit-abc1234"])

  test("says loading… under it until its files arrive", async () => {
    const { lines, spans } = await show({ events, feed: { expandedIds } })
    expect(lines).toEqual([
      "",
      "  Feed   3 events · all types",
      LEGEND_ALL,
      SPACER,
      "      1d   commit   @a-very-long…  ▾ abc1234  fix: handle empty hunks                        ✓ 3/3",
      "                                   loading…",
      "           commit   @dave          ▸ def5678  feat: word diff                                ✗ 1/3",
      "      2d   push     @you                      force-pushed",
    ])
    expect(fgAt(spans, ...find(lines, "loading…"))).toEqual(ints(colors.textDim))
  })

  test("lists the files with their counts, and selects a file row in the text colour", async () => {
    const { lines, spans } = await show({
      events,
      feed: { expandedIds, commitFiles: new Map([["abc1234", FILES]]), highlightIndex: 2 },
    })
    expect(lines).toEqual([
      "",
      "  Feed   3 events · all types",
      LEGEND_ALL,
      SPACER,
      "      1d   commit   @a-very-long…  ▾ abc1234  fix: handle empty hunks                        ✓ 3/3",
      "                                   ├ src/diff.ts  +12 -3",
      "                                   └ src/diff.test.ts  +40 -0",
      "           commit   @dave          ▸ def5678  feat: word diff                                ✗ 1/3",
      "      2d   push     @you                      force-pushed",
    ])
    expect(fgAt(spans, ...find(lines, "├ src/diff.ts"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "+12"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "-3"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "└ src/diff.test.ts"))).toEqual(ints(colors.text))
    expect(bgAt(spans, 2, 6)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 97, 6)).toEqual(ints(theme.surface0))
    expect(bgAt(spans, 2, 4)).toEqual(bgAt(spans, 0, 0)!)
    expect(bgAt(spans, 2, 5)).toEqual(bgAt(spans, 0, 0)!)
  })
})

test("selects an event row further down in surface0", async () => {
  const { lines, spans } = await show({ events: MIXED, feed: { highlightIndex: 2 } })
  expect(bgAt(spans, 2, 6)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 97, 6)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 2, 4)).toEqual(bgAt(spans, 0, 0)!)
  expect(fgAt(spans, ...find(lines, "approved"))).toEqual(ints(colors.text))
  expect(fgAt(spans, ...find(lines, "Rename this"))).toEqual(ints(theme.subtext1))
})

test("writes flash labels in the gutter, in red", async () => {
  const { lines, spans } = await show({ events: MIXED.slice(0, 4), flash: [[1, "a"], [3, "sd"]] })
  expect(lines.slice(4)).toEqual([
    "      5m   comment  @alice         src/greet.ts:12                       Rename this",
    "  a      ✓ comment  @bob           …ome/deeply/nested/module/file.ts:40  Typo",
    "      3h   review   @carol                                               approved  LGTM overall",
    "  sd       check                                                         build            ✓ passed",
  ])
  expect(fgAt(spans, 2, 5)).toEqual(ints(colors.flashLabel))
  expect(fgAt(spans, 2, 7)).toEqual(ints(colors.flashLabel))
  expect(fgAt(spans, 3, 7)).toEqual(ints(colors.flashLabel))
})

describe("the legend", () => {
  test("says a toggle that is on with a peach key and a text label, one that is off in dim", async () => {
    const { lines, spans } = await show({
      events: MIXED.slice(4, 6),
      feed: { types: new Set(["commit", "review"]), unseenOnly: true },
    })
    expect(lines.slice(0, 4)).toEqual([
      "",
      "  Feed   2 events · commit · review",
      "   c commits  m comments  r reviews  b checks   t resolved  p pushes  u unseen  / filter   esc all",
      SPACER,
    ])
    const key = (label: string) => {
      const [x, y] = find(lines, label, 2)
      return fgAt(spans, x - 1, y)
    }
    const label = (text: string) => fgAt(spans, ...find(lines, text, 2))
    expect(key("commits")).toEqual(ints(theme.peach))
    expect(label("commits")).toEqual(ints(colors.text))
    expect(key("reviews")).toEqual(ints(theme.peach))
    expect(label("reviews")).toEqual(ints(colors.text))
    expect(key("unseen")).toEqual(ints(theme.peach))
    expect(label("unseen")).toEqual(ints(colors.text))
    expect(key("comments")).toEqual(ints(colors.textDim))
    expect(label("comments")).toEqual(ints(colors.textDim))
    expect(label("checks")).toEqual(ints(colors.textDim))
    expect(label("filter")).toEqual(ints(colors.textDim))
    expect(label("esc all")).toEqual(ints(colors.textDim))
  })

  test("keeps its gaps whole where it fits", async () => {
    const { lines } = await show({ events: [], feed: { types: new Set(["commit"]), filter: "zzz" }, width: 120 })
    expect(lines[2]).toBe(
      "   c commits    m comments    r reviews    b checks    t resolved    p pushes    u unseen    / zzz    esc all"
    )
  })

  test("gives its row to the filter field while the filter is typed", async () => {
    const { lines, spans } = await show({
      events: MIXED.slice(4, 6),
      feed: { filterInput: true, filter: "fix" },
      typed: "fix",
    })
    expect(lines.slice(0, 6)).toEqual([
      "",
      "  Feed   2 events · all types",
      "  /fix",
      SPACER,
      "      1d   commit   @a-very-long…  ▸ abc1234  fix: handle empty hunks                        ✓ 3/3",
      "           commit   @dave          ▸ def5678  feat: word diff                                ✗ 1/3",
    ])
    expect(fgAt(spans, 2, 2)).toEqual(ints(colors.secondary))
    expect(fgAt(spans, 3, 2)).toEqual(ints(colors.text))
  })
})

// The test screen stands for the whole terminal but mounts the feed without
// the header and the status bar, so the two rows they would take are left
// over at the bottom of the frame.
test("a feed longer than the screen scrolls to keep its highlight in view", async () => {
  const { lines, spans } = await show({ events: many, feed: { highlightIndex: 59 } })
  expect(lines.length).toBeLessThanOrEqual(28)
  expect(lines[4]).toBe("      1d   comment  @alice         src/greet.ts:12  Note 36")
  expect(lines[27]).toBe("           comment  @alice         src/greet.ts:12  Note 59")
  expect(lines.join("\n")).not.toContain("Note 35")
  expect(bgAt(spans, 2, 27)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 97, 27)).toEqual(ints(theme.surface0))
  for (let y = 4; y < 27; y++) expect(bgAt(spans, 2, y)).not.toEqual(ints(theme.surface0))
  expect(bgAt(spans, 2, 29)).toEqual(bgAt(spans, 0, 0)!)
})

test("a commit's loading line takes a row of the window", async () => {
  const events = [...many.slice(0, 30), commit("abc1234", 60 * 24 * 3), ...many.slice(30)]
  const { lines, spans } = await show({ events, feed: { highlightIndex: 30, expandedIds: new Set(["commit-abc1234"]) } })
  expect(lines[16]).toBe("      3d   commit   @dave          ▾ abc1234        fix: handle empty hunks")
  expect(lines[17]).toBe("                                   loading…")
  expect(lines[18]).toBe("      1d   comment  @alice         src/greet.ts:12  Note 30")
  // Twenty-four rows for the list: the loading line costs Note 40 its place at the bottom.
  expect(lines.length).toBe(28)
  expect(lines[27]).toBe("           comment  @alice         src/greet.ts:12  Note 39")
  expect(bgAt(spans, 2, 16)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 97, 16)).toEqual(ints(theme.surface0))
  expect(bgAt(spans, 2, 17)).not.toEqual(ints(theme.surface0))
})

test("the first event row under a commit's loading line writes its own time", async () => {
  const events = [...many.slice(0, 10), commit("abc1234", 10 * 61), ...many.slice(10)]
  const { lines } = await show({ events, height: 12, feed: { highlightIndex: 13, expandedIds: new Set(["commit-abc1234"]) } })
  const [, loading] = find(lines, "loading…")
  expect(loading).toBe(4)
  expect(lines.join("\n")).not.toContain("abc1234")
  expect(lines[loading + 1]).toBe("     10h   comment  @alice         src/greet.ts:12  Note 10")
})
