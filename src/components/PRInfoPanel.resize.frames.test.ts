import { test, expect } from "bun:test"
import type { PrCheck } from "../providers/github/types"
import type { Comment } from "../types"
import { trimFrame } from "../testing/frame"
import { ago, prInfo } from "../testing/pr-info"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"

// A header is cut to the panel's width when it is pushed, and that width
// follows the screen's; the cut has to follow the screen when it is resized
// under an open panel (spec 067).

const mount = usePrInfoPanel()

const check = (id: number, name: string, conclusion: PrCheck["conclusion"]): PrCheck => ({
  id,
  name,
  status: "completed",
  conclusion,
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  isRequired: true,
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

const blocked = prInfo("Adds the skill.", {
  baseRef: "main",
  mergeable: "CONFLICTING",
  mergeStateStatus: "DIRTY",
  reviewDecision: "APPROVED",
  requiredApprovals: 1,
  reviews: [{ id: "PRR_alice", author: "alice", state: "APPROVED", submittedAt: ago(30) }],
  requestedReviewers: [],
  checks: [check(1, "build", "success"), check(2, "lint", "failure")],
})

const FULL = "  ▶  Merge status  ✗ blocked · lint failing · 1 unresolved · conflicts"

test("the folded merge status is cut again when the screen narrows, and whole again when it widens", async () => {
  const { lines, mounted } = await mount({
    info: blocked,
    width: 100,
    comments: [openThread],
    openSections: [],
    prepare: (p) => p.setBehindBy(0),
  })
  expect(lines[find(lines, "Merge status")[1]]).toBe(FULL)

  const resizedTo = async (width: number) => {
    mounted.setup.resize(width, 40)
    const frame = (await mounted.frame()).split("\n")
    return frame[find(frame, "Merge status")[1]]!
  }

  const narrow = await resizedTo(50)
  expect(narrow).toBe("  ▶  Merge status  ✗ blocked · lint failing · 1…")
  expect(narrow.length).toBeLessThanOrEqual(50)

  const wide = await resizedTo(100)
  expect(wide).toBe(FULL)
  expect(wide).not.toContain("…")
  expect(trimFrame(mounted.setup.captureCharFrame())).not.toContain("…")
})
