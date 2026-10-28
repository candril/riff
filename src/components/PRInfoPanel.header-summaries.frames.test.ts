import { test, expect, describe } from "bun:test"
import type { PrCheck, PrInfo, PrReview } from "../providers/github/types"
import type { Comment } from "../types"
import { fgAt, ints } from "../testing/frame"
import { ago, prInfo, previews } from "../testing/pr-info"
import { find, fullPr, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The folded section headers as the reader scans them: each summary right
// after its title, coloured by what it means, and a folded merge status that
// names what holds it (specs 067, 108).

const mount = usePrInfoPanel()

const check = (id: number, name: string, over: Partial<PrCheck> = {}): PrCheck => ({
  id,
  name,
  status: "completed",
  conclusion: "success",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  isRequired: true,
  ...over,
})
const failingCheck = (id: number, name: string) => check(id, name, { conclusion: "failure" })
const pendingCheck = (id: number, name: string) => check(id, name, { status: "in_progress", conclusion: null })

const review = (author: string, state: PrReview["state"]): PrReview => ({
  id: `PRR_${author}`,
  author,
  state,
  submittedAt: ago(30),
})

const ready = (over: Partial<PrInfo> = {}): PrInfo =>
  prInfo("Adds the skill.", {
    baseRef: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    requiredApprovals: 1,
    reviews: [review("alice", "APPROVED")],
    requestedReviewers: [],
    checks: [check(1, "build")],
    ...over,
  })

const openThread: Comment = {
  id: "gh-1",
  filename: "src/greet.ts",
  line: 12,
  side: "RIGHT",
  body: "Rename this",
  createdAt: ago(30),
  status: "synced",
  author: "bob",
  isThreadResolved: false,
}

/** The panel with every section folded, the compare having answered up to date. */
const folded = (info: PrInfo, { width = 100, comments = [] as Comment[] } = {}) =>
  mount({ info, width, comments, prepare: (p) => p.setBehindBy(0) })

const mergeHeader = (lines: string[]) => lines[find(lines, "Merge status")[1]]!

describe("the folded merge status", () => {
  test("reads ready right after its title", async () => {
    const { lines, spans } = await folded(ready())
    expect(mergeHeader(lines)).toBe("  ▶  Merge status  ✓ ready")
    expect(fgAt(spans, ...find(lines, "✓ ready"))).toEqual(ints(theme.green))
  })

  test("names the one failing check", async () => {
    const { lines, spans } = await folded(ready({ checks: [check(1, "build"), failingCheck(2, "lint")] }))
    expect(mergeHeader(lines)).toBe("  ▶  Merge status  ✗ blocked · lint failing")
    expect(fgAt(spans, ...find(lines, "✗ blocked"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "lint failing"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, " · "))).toEqual(ints(theme.subtext0))
  })

  test("names two failing checks, counts the rest, and counts the pending ones without naming them", async () => {
    const checks = [
      failingCheck(1, "lint"),
      failingCheck(2, "e2e"),
      failingCheck(3, "unit"),
      ...["a", "b", "c", "d"].map((name, i) => pendingCheck(10 + i, name)),
    ]
    const { lines, spans } = await folded(ready({ checks }))
    expect(mergeHeader(lines)).toBe("  ▶  Merge status  ✗ blocked · lint, e2e failing +1 · ⧗ 4 pending")
    expect(fgAt(spans, ...find(lines, "⧗ 4 pending"))).toEqual(ints(theme.overlay0))
  })

  test("joins a failing check, an open thread and conflicts", async () => {
    const info = ready({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", checks: [failingCheck(1, "lint")] })
    const { lines, spans } = await folded(info, { comments: [openThread] })
    expect(mergeHeader(lines)).toBe("  ▶  Merge status  ✗ blocked · lint failing · 1 unresolved · conflicts")
    expect(fgAt(spans, ...find(lines, "1 unresolved"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "conflicts"))).toEqual(ints(theme.red))
  })

  test("names a gate still pending when that is all that warns", async () => {
    const { lines, spans } = await folded(ready({ mergeable: "UNKNOWN" }))
    expect(mergeHeader(lines)).toBe("  ▶  Merge status  ⚠ mergeable with warnings · checking conflicts")
    expect(fgAt(spans, ...find(lines, "checking conflicts"))).toEqual(ints(theme.overlay0))
    const comparing = await mount({ info: ready(), width: 100, comments: [] })
    expect(mergeHeader(comparing.lines)).toBe("  ▶  Merge status  ⚠ mergeable with warnings · comparing with main")
    const unstable = await folded(ready({ mergeStateStatus: "UNSTABLE" }))
    expect(mergeHeader(unstable.lines)).toBe("  ▶  Merge status  ⚠ mergeable with warnings · unstable")
    expect(fgAt(unstable.spans, ...find(unstable.lines, "unstable"))).toEqual(ints(theme.yellow))
  })

  test("ends in … at a narrow panel's edge rather than wrapping onto a second row", async () => {
    const info = ready({ mergeable: "CONFLICTING", mergeStateStatus: "DIRTY", checks: [failingCheck(1, "lint")] })
    const { lines, spans } = await folded(info, { width: 50, comments: [openThread] })
    const [, y] = find(lines, "Merge status")
    expect(lines[y]).toBe("  ▶  Merge status  ✗ blocked · lint failing · 1…")
    expect(lines[y]!.length).toBe(50 - 2)
    expect(lines[y + 1]).toBe("")
    expect(fgAt(spans, 47, y)).toEqual(ints(theme.yellow))
  })

  test("keeps the flash label while it cuts", async () => {
    const info = ready({ checks: [check(1, "build"), failingCheck(2, "lint")] })
    const { lines } = await mount({
      info,
      width: 30,
      comments: [],
      prepare: (p) => {
        p.setBehindBy(0)
        p.setFlashLabels(new Map([["checks", "a"]]))
      },
    })
    expect(mergeHeader(lines)).toBe("  a ▶  Merge status  ✗ bloc…")
  })
})

describe("the other folded headers", () => {
  test("colour their summaries by meaning", async () => {
    const { lines, spans } = await mount({ info: fullPr(), width: 120, prepare: (p) => p.setPreviews(previews()) })
    expect(lines[find(lines, "Previews")[1]]).toBe("  ▶  Previews (2)  1 live · 1 on demand  ·  from deploy-bot[bot]")
    expect(fgAt(spans, ...find(lines, "1 live"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "1 on demand"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "deploy-bot"))).toEqual(ints(theme.overlay1))
    expect(lines[find(lines, "Files")[1]]).toBe("  ▶  Files (2)  +98 -0")
    expect(fgAt(spans, ...find(lines, "+98"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "-0"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "2 unresolved"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "last 1h"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "Files"))).toEqual(ints(theme.overlay0))
  })
})
