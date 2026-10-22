import { test, expect, describe } from "bun:test"
import type { PrReview } from "../providers/github/types"
import { pinStdoutColumns } from "../testing/frame"
import { ago, reviews } from "../testing/pr-info"
import { fullPr, usePrInfoPanel } from "../testing/pr-info-panel"
import type { StackInfo } from "../utils/stack"

// The meta row, the stack line and the section headers are pushed to again,
// never rebuilt. Reused renderables can lay out differently from fresh ones
// once a row overflows, so whatever a sequence of pushes leaves on screen is
// held against a panel built straight into that state.

const mount = usePrInfoPanel()

const STACK: StackInfo = { basePr: { number: 1200, title: "Base work" }, status: "moved", behindBy: 3 }

// Enough approvers that the meta row overflows at 80 columns.
const approved = (): PrReview[] => [
  ...reviews(),
  ...["frank-from-platform", "grace-from-design"].map((author, i) => ({
    id: `PRR_${author}`,
    author,
    state: "APPROVED" as const,
    submittedAt: ago(30 - i),
  })),
]

describe("the header and meta rows, pushed to again", () => {
  for (const width of [100, 80]) {
    test(`draw what a fresh panel draws at ${width} columns after a header move, a stack and a new approval`, async () => {
      const restoreColumns = pinStdoutColumns(width)
      try {
        const reused = await mount({ width, prepare: (p) => p.setActiveSection("previews") })
        reused.panel.step(1)
        await reused.mounted.frame()
        reused.panel.setStack(STACK)
        await reused.mounted.frame()
        reused.panel.setPrInfo({ ...fullPr(), reviews: approved() })
        const lines = (await reused.mounted.frame()).split("\n")
        const spans = reused.mounted.setup.captureSpans()

        const fresh = await mount({
          width,
          info: { ...fullPr(), reviews: approved() },
          prepare: (p) => {
            p.setActiveSection("conversation")
            p.setStack(STACK)
          },
        })

        expect(lines[1]).toStartWith("  @someone  a-branch → master   ✓ @alice @erin @frank-from-platform @grace-")
        expect(lines[2]).toBe("  stacked on #1200 Base work · base moved on by 3 commits")
        expect(lines[6]).toStartWith("  ▶  Merge status  ✗ blocked · test, e2e failing +2")
        expect(lines).toEqual(fresh.lines)
        expect(spans).toEqual(fresh.spans)
      } finally {
        restoreColumns()
      }
    })
  }

  test("cut an overflowing header at the edge, as a fresh panel does, after a move, a hidden comment and labels", async () => {
    const width = 36
    const restoreColumns = pinStdoutColumns(width)
    const labels = new Map([["conversation", "ab"], ["checks", "c"]])
    try {
      const reused = await mount({ width, prepare: (p) => p.setActiveSection("previews") })
      reused.panel.step(1)
      await reused.mounted.frame()
      reused.panel.setHiddenConversation(new Set(["502"]))
      await reused.mounted.frame()
      reused.panel.setFlashLabels(labels)
      const lines = (await reused.mounted.frame()).split("\n")
      const spans = reused.mounted.setup.captureSpans()

      const fresh = await mount({
        width,
        prepare: (p) => {
          p.setActiveSection("conversation")
          p.setHiddenConversation(new Set(["502"]))
          p.setFlashLabels(labels)
        },
      })

      expect(lines).toContain("  ab ▶  Conversation (6 · 1 hidde…")
      expect(lines[6]).toBe("  c ▶  Merge status  ✗ blocked · …")
      expect(lines).toEqual(fresh.lines)
      expect(spans).toEqual(fresh.spans)
    } finally {
      restoreColumns()
    }
  })
})
