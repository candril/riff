import { test, expect, describe } from "bun:test"
import type { PrCheck, PrInfo, PrReview } from "../providers/github/types"
import { fgAt, ints } from "../testing/frame"
import { ago, prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The Merge status section as the panel opens on it: the verdict at the
// header's right end, a line per gate, and the checks under their line
// (spec 108). Demo mode has no PR, so these fixtures are the only place the
// section is drawn from realistic GitHub answers.

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

const review = (author: string, state: PrReview["state"], minutes: number): PrReview => ({
  id: `PRR_${author}`,
  author,
  state,
  submittedAt: ago(minutes),
})

const NINE_GREEN = ["build", "lint", "unit", "e2e", "types", "docs", "audit", "deploy", "storybook"].map((name, i) =>
  check(i + 1, name)
)

const ready = (over: Partial<PrInfo> = {}): PrInfo =>
  prInfo("Adds the skill.", {
    baseRef: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    requiredApprovals: 2,
    reviews: [review("alice", "APPROVED", 60), review("erin", "APPROVED", 30)],
    requestedReviewers: [],
    checks: NINE_GREEN,
    ...over,
  })

const warnings = (): PrInfo =>
  ready({ checks: [check(1, "build"), check(2, "docs", { conclusion: "failure", isRequired: false })] })

const blocked = (): PrInfo =>
  ready({
    mergeStateStatus: "BEHIND",
    reviewDecision: "CHANGES_REQUESTED",
    reviews: [review("alice", "APPROVED", 60), review("bob", "CHANGES_REQUESTED", 30)],
    checks: [
      check(1, "build"),
      check(2, "test", {
        conclusion: "failure",
        annotationsStatus: "loaded",
        annotations: [{ path: "src/greet.ts", startLine: 12, endLine: 12, level: "failure", message: "Expected 2, got 3" }],
      }),
    ],
  })

/** The section opened on `info`, the compare having answered `behindBy`. */
const open = (info: PrInfo, behindBy: number, width = 100) =>
  mount({ info, width, comments: [], mergeStatusOpen: true, prepare: (p) => p.setBehindBy(behindBy) })

/** The gate lines: indented once, where the checks under them are indented twice. */
const gates = (lines: string[]) => lines.filter((line) => /^    \S/.test(line))

describe("the merge status", () => {
  test("reads ready at the header's right end, and every gate passes", async () => {
    const { lines, spans } = await open(ready(), 0)
    expect(lines[6]).toBe(`  ▼  Merge status${" ".repeat(74)}✓ ready`)
    expect(gates(lines).slice(0, 6)).toEqual([
      "    ✓ Checks         9/9 passed  ▼",
      "    ✓ Reviews        2/2 approvals",
      "    ✓ Conversations  all resolved",
      "    ✓ Conflicts      no conflicts",
      "    ✓ Base           up to date with main",
      "    ✓ Blockers       none",
    ])
    expect(fgAt(spans, ...find(lines, "✓ ready"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "✓ Reviews"))).toEqual(ints(theme.green))
    expect(fgAt(spans, ...find(lines, "2/2 approvals"))).toEqual(ints(theme.subtext1))
    expect(fgAt(spans, ...find(lines, "Reviews"))).toEqual(ints(theme.subtext0))
    expect(fgAt(spans, ...find(lines, "  ▼", 8))).toEqual(ints(theme.overlay0))
  })

  test("reads mergeable with warnings when only an optional check fails", async () => {
    const { lines, spans } = await open(warnings(), 0)
    expect(lines[6]).toBe(`  ▼  Merge status${" ".repeat(56)}⚠ mergeable with warnings`)
    expect(gates(lines)[0]).toBe("    ⚠ Checks         1/2 · docs failing (optional)  ▼")
    expect(fgAt(spans, ...find(lines, "⚠ mergeable with warnings"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "⚠ Checks"))).toEqual(ints(theme.yellow))
  })

  test("reads blocked on a failing required check, a change request and a base it must catch up with", async () => {
    const { lines, spans } = await open(blocked(), 3)
    expect(lines[6]).toBe(`  ▼  Merge status${" ".repeat(72)}✗ blocked`)
    expect(gates(lines).slice(0, 6)).toEqual([
      "    ✗ Checks         1/2 · test failing  ▼",
      "    ✗ Reviews        1/2 approvals · changes requested by bob",
      "    ✓ Conversations  all resolved",
      "    ✓ Conflicts      no conflicts",
      "    ✗ Base           3 commits behind main",
      "    ✓ Blockers       none",
    ])
    expect(fgAt(spans, ...find(lines, "✗ blocked"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "✗ Base"))).toEqual(ints(theme.red))
    expect(fgAt(spans, ...find(lines, "✓ Conflicts"))).toEqual(ints(theme.green))
  })

  test("compares with the base until the compare answers", async () => {
    const { lines, spans } = await mount({ info: ready(), width: 100, comments: [], mergeStatusOpen: true })
    expect(gates(lines)[4]).toBe("    ○ Base           comparing with main")
    expect(fgAt(spans, ...find(lines, "○ Base"))).toEqual(ints(theme.overlay0))
    expect(lines[6]).toEndWith("⚠ mergeable with warnings")
  })
})

describe("the checks line", () => {
  test("opens on arrival onto the checks, indented under it, a failing one still opening onto its annotations", async () => {
    const { lines, panel, mounted } = await open(blocked(), 3)
    expect(lines.slice(8, 12)).toEqual([
      "    ✗ Checks         1/2 · test failing  ▼",
      "      ✓ build",
      "      ✗ test (failure)  ▶ [1]",
      "    ✗ Reviews        1/2 approvals · changes requested by bob",
    ])

    panel.toggleCheckExpansion(2)
    const expanded = (await mounted.frame()).split("\n")
    expect(expanded.slice(10, 13)).toEqual([
      "      ✗ test (failure)  ▼ [1]",
      "        • src/greet.ts:12",
      "            Expected 2, got 3",
    ])
  })

  test("folds and opens with h and l on it, and h on a check folds the line and climbs onto it", async () => {
    const { panel, mounted } = await open(blocked(), 3)
    panel.setActiveSection("checks")
    panel.moveCursor(1)
    panel.collapseSelectedCheck()
    const folded = (await mounted.frame()).split("\n")
    expect(folded.slice(8, 10)).toEqual([
      "    ✗ Checks         1/2 · test failing  ▶",
      "    ✗ Reviews        1/2 approvals · changes requested by bob",
    ])
    expect(panel.getSelectedCheck()).toBeUndefined()

    panel.expandSelectedCheck()
    panel.moveCursor(1)
    expect(panel.getSelectedCheck()?.name).toBe("build")
    panel.collapseSelectedCheck()
    expect(panel.getCursorIndex()).toBe(0)
    expect((await mounted.frame()).split("\n")[9]).toBe("    ✗ Reviews        1/2 approvals · changes requested by bob")
  })
})

describe("a narrow panel", () => {
  test("keeps the verdict at 50 columns", async () => {
    const { lines, spans } = await open(warnings(), 0, 50)
    expect(lines[6]).toBe(`  ▼  Merge status${" ".repeat(6)}⚠ mergeable with warnings`)
    expect(fgAt(spans, ...find(lines, "⚠ mergeable"))).toEqual(ints(theme.yellow))
  })

  test("cuts the title, never the verdict, once both do not fit", async () => {
    const { lines } = await open(warnings(), 0, 36)
    expect(lines[6]).toEndWith(" ⚠ mergeable with warnings")
    expect(lines[6]!.length).toBe(34)
  })
})
