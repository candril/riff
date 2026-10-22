import { test, expect, describe } from "bun:test"
import type { PrCheck, PrInfo, PrMergeQueue, PrReview } from "../providers/github/types"
import type { Comment } from "../types"
import { fgAt, ints } from "../testing/frame"
import { ago, prInfo } from "../testing/pr-info"
import { find, pressFold, PR_FILES, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// The Merge status section as the panel opens on it: the verdict right
// after the title, a line per gate, and the checks under their line
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
  test("reads ready right after its title, and every gate passes", async () => {
    const { lines, spans } = await open(ready(), 0)
    expect(lines[6]).toBe("  ▼  Merge status  ✓ ready")
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
    expect(lines[6]).toBe("  ▼  Merge status  ⚠ mergeable with warnings")
    expect(gates(lines)[0]).toBe("    ⚠ Checks         1/2 · docs failing (optional)  ▼")
    expect(fgAt(spans, ...find(lines, "⚠ mergeable with warnings"))).toEqual(ints(theme.yellow))
    expect(fgAt(spans, ...find(lines, "⚠ Checks"))).toEqual(ints(theme.yellow))
  })

  test("reads blocked on a failing required check, a change request and a base it must catch up with", async () => {
    const { lines, spans } = await open(blocked(), 3)
    expect(lines[6]).toBe("  ▼  Merge status  ✗ blocked")
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

  test("a panel handed the compare's answer before it is drawn never shows it comparing", async () => {
    const { lines } = await mount({ info: ready(), width: 100, comments: [], mergeStatusOpen: true, prepare: (p) => p.setBehindBy(2) })
    const frame = lines.join("\n")
    expect(frame).toContain("2 commits behind main")
    expect(frame).not.toContain("comparing with")
  })

  test("a compare that failed says so in blue, and leaves a ready PR ready", async () => {
    const { lines, spans } = await mount({
      info: ready(),
      width: 100,
      comments: [],
      mergeStatusOpen: true,
      prepare: (p) => p.setBehindBy("failed"),
    })
    expect(gates(lines)[4]).toBe("    ℹ Base           could not compare with main")
    expect(fgAt(spans, ...find(lines, "ℹ Base"))).toEqual(ints(theme.blue))
    expect(lines[6]).toBe("  ▼  Merge status  ✓ ready")
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

  test("folds and opens with h and l on it, and h on a check climbs onto it and leaves it open", async () => {
    const { panel, mounted } = await open(blocked(), 3)
    panel.setActiveSection("checks")
    panel.moveCursor(1)
    pressFold(panel, "h")
    const folded = (await mounted.frame()).split("\n")
    expect(folded.slice(8, 10)).toEqual([
      "    ✗ Checks         1/2 · test failing  ▶",
      "    ✗ Reviews        1/2 approvals · changes requested by bob",
    ])
    expect(panel.getSelectedCheck()).toBeUndefined()

    pressFold(panel, "l")
    pressFold(panel, "l")
    expect(panel.getSelectedCheck()?.name).toBe("build")
    pressFold(panel, "h")
    expect(panel.getCursorIndex()).toBe(0)
    expect((await mounted.frame()).split("\n")[8]).toBe("    ✗ Checks         1/2 · test failing  ▼")
  })
})

describe("the conversations line", () => {
  const thread = (id: string, over: Partial<Comment>): Comment => ({
    id,
    filename: "src/greet.ts",
    line: 12,
    side: "RIGHT",
    body: "",
    createdAt: ago(30),
    status: "synced",
    author: "bob",
    isThreadResolved: false,
    ...over,
  })
  const open = [
    thread("gh-1", { body: "Rename this to greeting, it is what every caller calls it" }),
    // GitHub answers a comment on the whole file with no line.
    thread("gh-2", { filename: "src/farewell.ts", line: undefined as unknown as number, author: "carol", body: "Needs a test" }),
  ]
  const THREADS = [...open, thread("gh-3", { filename: "src/a.ts", body: "Settled", isThreadResolved: true })]

  /** The section on one green check, so the conversations line is its fourth row. */
  const onConversations = (width: number, { expand = false } = {}) =>
    mount({
      info: ready({ checks: [check(1, "build")] }),
      comments: THREADS,
      width,
      mergeStatusOpen: true,
      prepare: (p) => {
        p.setBehindBy(0)
        p.setActiveSection("checks")
        p.moveCursor(4)
        // Inside the mount, where the terminal reads as wide as the screen.
        if (expand) pressFold(p, "l")
      },
    })

  test("stays folded on arrival, counting only the unresolved threads", async () => {
    const { lines, spans } = await onConversations(100)
    expect(gates(lines)[2]).toBe("    ⚠ Conversations  2 unresolved  ▶")
    expect(lines.join("\n")).not.toContain("farewell.ts")
    expect(fgAt(spans, ...find(lines, "▶", 9))).toEqual(ints(theme.overlay0))
  })

  test("opens with l onto each unresolved thread, by file path, then line, the resolved one left out", async () => {
    const { lines } = await onConversations(100, { expand: true })
    const at = lines.indexOf("    ⚠ Conversations  2 unresolved  ▼")
    expect(at).toBeGreaterThan(0)
    expect(lines.slice(at + 1, at + 4)).toEqual([
      "      ⚠ farewell.ts (file)  @carol  Needs a test",
      "      ⚠ greet.ts:12  @bob  Rename this to greeting, it is what every caller calls it",
      "    ✓ Conflicts      no conflicts",
    ])
    expect(lines.join("\n")).not.toContain("Settled")
  })

  test("cuts a thread's row at the panel's right edge at 60 columns", async () => {
    const { lines } = await onConversations(60, { expand: true })
    const at = lines.indexOf("    ⚠ Conversations  2 unresolved  ▼")
    expect(lines.slice(at + 1, at + 3)).toEqual([
      "      ⚠ farewell.ts (file)  @carol  Needs a test",
      "      ⚠ greet.ts:12  @bob  Rename this to greeting, it i…",
    ])
  })

  test("h on a thread climbs onto the line and leaves it open, and a thread is no check", async () => {
    const { panel, mounted } = await onConversations(100)
    pressFold(panel, "l")
    pressFold(panel, "l")
    expect(panel.getSelectedCheck()).toBeUndefined()
    expect(panel.getSelectedMergeThread()?.id).toBe("gh-2")
    pressFold(panel, "h")
    expect(panel.getCursorIndex()).toBe(3)
    expect(panel.getSelectedMergeThread()).toBeUndefined()
    expect(gates((await mounted.frame()).split("\n"))[2]).toBe("    ⚠ Conversations  2 unresolved  ▼")
  })

  test("a rebuild with every thread resolved stops the line opening, drops its rows and keeps the cursor on a row", async () => {
    const { panel } = await onConversations(100, { expand: true })
    panel.moveCursor(2)
    expect(panel.getSelectedMergeThread()?.id).toBe("gh-1")
    const position = panel.capturePosition()

    const resolved = THREADS.map((t) => ({ ...t, isThreadResolved: true }))
    const rebuilt = await mount({
      info: ready({ checks: [check(1, "build")] }),
      comments: resolved,
      files: PR_FILES,
      width: 100,
      mergeStatusOpen: true,
      prepare: (p) => {
        p.setBehindBy(0)
        p.restorePosition(position)
      },
    })
    const lines = (await rebuilt.mounted.frame()).split("\n")
    expect(gates(lines)[2]).toBe("    ✓ Conversations  all resolved")
    expect(lines.join("\n")).not.toContain("greet.ts:12")
    expect(rebuilt.panel.getSelectedMergeThread()).toBeUndefined()
    // Seven gate and check rows are left; the cursor that was on the second
    // thread now sits on the Base line, in the same place.
    expect(rebuilt.panel.getMaxCursorIndex()).toBe(6)
    expect(rebuilt.panel.getCursorIndex()).toBe(5)
    pressFold(rebuilt.panel, "zo")
    rebuilt.panel.moveCursor(-2)
    pressFold(rebuilt.panel, "zo")
    expect(rebuilt.panel.getMaxCursorIndex()).toBe(6)
  })
})

describe("a narrow panel", () => {
  test("keeps the verdict whole at 50 columns", async () => {
    const { lines, spans } = await open(warnings(), 0, 50)
    expect(lines[6]).toBe("  ▼  Merge status  ⚠ mergeable with warnings")
    expect(fgAt(spans, ...find(lines, "⚠ mergeable"))).toEqual(ints(theme.yellow))
  })

  test("ends the verdict in … at the edge once it does not fit", async () => {
    const { lines } = await open(warnings(), 0, 36)
    expect(lines[6]).toBe("  ▼  Merge status  ⚠ mergeable wi…")
    expect(lines[7]).toBe("")
  })
})

describe("the queue line", () => {
  const entry = (over: Partial<NonNullable<PrMergeQueue["entry"]>> = {}): PrMergeQueue => ({
    entry: {
      position: 3,
      total: 7,
      state: "AWAITING_CHECKS",
      etaSeconds: 720,
      enqueuedAt: ago(20),
      enqueuer: "alice",
      ...over,
    },
    inQueue: true,
    removal: null,
  })
  const REMOVED: PrMergeQueue = { entry: null, inQueue: false, removal: { reason: "Merge conflicts", at: ago(5) } }
  const folded = (info: PrInfo) =>
    mount({ info, width: 100, comments: [], prepare: (p) => p.setBehindBy(0) })
  const header = (lines: string[]) => lines.find((line) => line.includes("Merge status")) ?? ""

  test("is not there when the base has no queue", async () => {
    const { lines } = await open(ready({ mergeQueue: null }), 0)
    expect(lines.join("\n")).not.toContain("Queue")
    expect(gates(lines).slice(0, 6)).toEqual([
      "    ✓ Checks         9/9 passed  ▼",
      "    ✓ Reviews        2/2 approvals",
      "    ✓ Conversations  all resolved",
      "    ✓ Conflicts      no conflicts",
      "    ✓ Base           up to date with main",
      "    ✓ Blockers       none",
    ])
  })

  test("not queued sits dimmed between the base and the blockers, and adds nothing to the header", async () => {
    const { lines, spans } = await open(ready({ mergeQueue: { entry: null, inQueue: false, removal: null } }), 0)
    expect(lines[6]).toBe("  ▼  Merge status  ✓ ready")
    const at = lines.indexOf("    ✓ Base           up to date with main")
    expect(lines.slice(at + 1, at + 3)).toEqual([
      "      Queue          not queued · merging adds it",
      "    ✓ Blockers       none",
    ])
    expect(fgAt(spans, ...find(lines, "Queue"))).toEqual(ints(theme.overlay0))
    expect(fgAt(spans, ...find(lines, "not queued"))).toEqual(ints(theme.overlay0))

    const closed = await folded(ready({ mergeQueue: { entry: null, inQueue: false, removal: null } }))
    expect(header(closed.lines)).toBe("  ▶  Merge status  ✓ ready")
  })

  test("queued reads its place in blue, and the header, open or folded, is that place alone", async () => {
    const info = ready({ mergeQueue: entry() })
    const { lines, spans } = await open(info, 0)
    expect(lines[6]).toBe("  ▼  Merge status  ⧗ queued #3 of 7 · ~12m")
    expect(lines).toContain("    ⧗ Queue          #3 of 7 · awaiting checks · ~12m · added by alice 20m ago")
    expect(fgAt(spans, ...find(lines, "⧗ Queue"))).toEqual(ints(theme.blue))
    expect(fgAt(spans, ...find(lines, "⧗ queued"))).toEqual(ints(theme.blue))

    const closed = await folded(info)
    expect(header(closed.lines)).toBe("  ▶  Merge status  ⧗ queued #3 of 7 · ~12m")
    expect(fgAt(closed.spans, ...find(closed.lines, "⧗ queued"))).toEqual(ints(theme.blue))
  })

  test("a mergeable entry goes green", async () => {
    const { lines, spans } = await open(ready({ mergeQueue: entry({ state: "MERGEABLE" }) }), 0)
    expect(lines).toContain("    ⧗ Queue          #3 of 7 · mergeable · ~12m · added by alice 20m ago")
    expect(fgAt(spans, ...find(lines, "⧗ Queue"))).toEqual(ints(theme.green))
  })

  test("a removal fails in red with GitHub's reason, and blocks the folded header", async () => {
    const info = ready({ mergeQueue: REMOVED })
    const { lines, spans } = await open(info, 0)
    expect(lines[6]).toBe("  ▼  Merge status  ✗ blocked")
    expect(lines).toContain("    ✗ Queue          removed · merge conflicts")
    expect(fgAt(spans, ...find(lines, "✗ Queue"))).toEqual(ints(theme.red))

    const closed = await folded(info)
    expect(header(closed.lines)).toBe("  ▶  Merge status  ✗ blocked · removed from queue")
    expect(fgAt(closed.spans, ...find(closed.lines, "removed from queue"))).toEqual(ints(theme.red))
  })
})
