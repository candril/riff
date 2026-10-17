import { test, expect, describe, afterEach, beforeAll, afterAll, setSystemTime } from "bun:test"
import { bgAt, fgAt, ints, mountRenderable } from "../testing/frame"
import { theme } from "../theme"
import type { FilteredCommit } from "./CommitPicker"
import { createCommitPickerIsland } from "../app/pickers"
import { commitPickerModel, type CommitPickerInput } from "./commit-picker-model"
import type { PrCommit } from "../providers/github"
import { EMPTY_CHANGE } from "../providers/local"

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null

type Options = Partial<CommitPickerInput>

async function frame(options: Options = {}, { width, height } = { width: 100, height: 34 }) {
  const input: CommitPickerInput = {
    commits: COMMITS,
    selectedIndex: 0,
    viewingCommit: null,
    marked: new Set<string>(),
    filtering: false,
    query: "",
    extending: false,
    ...options,
  }
  mounted = await mountRenderable(
    (renderer) => {
      const island = createCommitPickerIsland(renderer)
      island.update(commitPickerModel(input, height, NOW))
      return island.host
    },
    { width, height }
  )
  return (await mounted.frame()).split("\n")
}

const NOW = new Date("2026-10-17T12:00:00Z")

beforeAll(() => setSystemTime(NOW))
afterAll(() => setSystemTime())

function usesBg(spans: ReturnType<NonNullable<typeof mounted>["setup"]["captureSpans"]>, hex: string) {
  const want = ints(hex).join()
  return spans.lines.some((line) => line.spans.some((span) => span.bg.toInts().join() === want))
}

afterEach(async () => {
  await mounted?.dispose()
  mounted = null
})

function commit(sha: string, message: string, minutesAgo: number, extra: Partial<PrCommit> = {}): PrCommit {
  return { sha, message, author: "octocat", date: new Date(NOW.getTime() - minutesAgo * 60_000).toISOString(), ...extra }
}

const COMMITS: FilteredCommit[] = [
  commit("a1b2c3d", "Add greeting", 5),
  commit("e4f5a6b", "Fix the parser", 3 * 60),
  commit("c7d8e9f", "Rename main", 2 * 24 * 60),
].map((c, index) => ({ commit: c, index }))

const MANY: FilteredCommit[] = Array.from({ length: 20 }, (_, i) => ({
  commit: commit(`sha${String(i).padStart(4, "0")}`, `Commit ${i}`, 10),
  index: i,
}))

// Sixty columns of a 100-column screen, less the padding, end the key line at "Enter:".
const KEYS = "j/k: move  space: mark  V: mark a run  /: filter  Enter:"

describe("the commit picker", () => {
  test("titles itself, offers / to filter, and lists every commit under All commits", async () => {
    const lines = await frame()
    const title = lines.find((l) => l.includes("Select Commit"))!
    expect(title).toMatch(/Select Commit\s+esc$/)
    expect(title.indexOf("Select Commit")).toBe(22)
    expect(title.length).toBe(78)
    const text = lines.join("\n")
    expect(text).toContain("/ to filter")
    expect(text).toMatch(/● All commits\s+3 commits/)
    expect(text).toMatch(/  a1b2c3d  Add greeting\s+@octocat  5m ago/)
    expect(text).toMatch(/  e4f5a6b  Fix the parser\s+@octocat  3h ago/)
    expect(text).toMatch(/  c7d8e9f  Rename main\s+@octocat  2d ago/)
    expect(text).toContain(KEYS)
  })

  test("puts the ● on the commit being viewed, and shades the selected row and the field surface0", async () => {
    const lines = await frame({ viewingCommit: "e4f5a6b", selectedIndex: 2 })
    const spans = mounted!.setup.captureSpans()
    expect(lines.some((l) => /^\s+All commits\s+3 commits/.test(l))).toBe(true)
    const selected = lines.findIndex((l) => l.includes("e4f5a6b"))
    expect(lines[selected]).toMatch(/● e4f5a6b/)
    const x = lines[selected]!.indexOf("e4f5a6b")
    expect(bgAt(spans, x, selected)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, x, selected)).toEqual(ints(theme.peach))
    const field = lines.findIndex((l) => l.includes("/ to filter"))
    expect(bgAt(spans, lines[field]!.indexOf("/"), field)).toEqual(ints(theme.surface0))
    expect(usesBg(spans, theme.surface2)).toBe(false)
    const other = lines.findIndex((l) => l.includes("a1b2c3d"))
    expect(bgAt(spans, x, other)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, x, other)).toEqual(ints(theme.yellow))
  })

  test("counts the marked commits in the title and draws a marked row in peach, shaded only when selected", async () => {
    const lines = await frame({ marked: new Set(["a1b2c3d", "c7d8e9f"]), selectedIndex: 3 })
    const spans = mounted!.setup.captureSpans()
    expect(lines.find((l) => l.includes("Select Commit"))).toMatch(/Select Commit  2 marked\s+esc$/)
    const marked = lines.findIndex((l) => l.includes("a1b2c3d"))
    const message = lines[marked]!.indexOf("Add greeting")
    expect(bgAt(spans, message, marked)).toEqual(ints(theme.mantle))
    expect(fgAt(spans, message, marked)).toEqual(ints(theme.peach))
    expect(fgAt(spans, lines[marked]!.indexOf("a1b2c3d"), marked)).toEqual(ints(theme.peach))
    const selected = lines.findIndex((l) => l.includes("c7d8e9f"))
    const selectedMessage = lines[selected]!.indexOf("Rename main")
    expect(bgAt(spans, selectedMessage, selected)).toEqual(ints(theme.surface0))
    expect(fgAt(spans, selectedMessage, selected)).toEqual(ints(theme.peach))
  })

  test("while filtering, shows / in front of the field; once accepted, the query", async () => {
    const filtering = await frame({ filtering: true, query: "fix" })
    const titleRow = filtering.findIndex((l) => l.includes("Select Commit"))
    expect(filtering[titleRow + 2]!.trim()).toBe("/")
    await mounted!.dispose()
    mounted = null

    const accepted = await frame({ query: "fix" })
    const row = accepted.findIndex((l) => l.includes("Select Commit"))
    expect(accepted[row + 2]!.trim()).toBe("/fix")
  })

  test("while V extends a run, says how to stop it", async () => {
    const lines = await frame({ extending: true })
    expect(lines.find((l) => l.includes("Select Commit"))).toMatch(/Select Commit\s+V: stop extending$/)
  })

  test("says when a change is empty", async () => {
    const lines = await frame({ commits: [{ commit: commit("0ddba11", "", 1, { empty: true }), index: 0 }] })
    expect(lines.some((l) => l.includes(`0ddba11`) && l.includes(`${EMPTY_CHANGE}  @octocat  1m ago`))).toBe(true)
  })

  test("past fifteen items, lists the first and says how many more there are", async () => {
    const text = (await frame({ commits: MANY })).join("\n")
    expect(text).toContain("Commit 13")
    expect(text).not.toContain("Commit 14")
    expect(text).toContain("↓ 6 more")
    expect(text).not.toContain("↑")
  })

  test("moved past the fifteenth item, keeps the selection in view", async () => {
    const lines = await frame({ commits: MANY, selectedIndex: 17 })
    const spans = mounted!.setup.captureSpans()
    const selected = lines.findIndex((l) => l.includes("Commit 16"))
    expect(selected).toBeGreaterThan(0)
    expect(bgAt(spans, lines[selected]!.indexOf("Commit 16"), selected)).toEqual(ints(theme.surface0))
    // Fifteen of the 21 items, centred on the eighteenth: items 6 to 20.
    const text = lines.join("\n")
    expect(text).toContain("↑ 6 more")
    expect(text).not.toContain("↓")
    expect(text).not.toContain("All commits")
    expect(text).toContain("Commit 19")
  })

  test("on a 24-row terminal, shortens the window so both notes and the key line stay on screen", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ commit: commit(`sha${String(i).padStart(4, "0")}`, `Commit ${i}`, 10), index: i }))
    const lines = await frame({ commits: many, selectedIndex: 15 }, { width: 80, height: 24 })
    expect(lines.some((l) => /↑ \d+ more/.test(l))).toBe(true)
    expect(lines.some((l) => /↓ \d+ more/.test(l))).toBe(true)
    expect(lines.findIndex((l) => l.includes("j/k: move"))).toBe(23)
  })
})
