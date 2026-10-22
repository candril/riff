import { test, expect, describe, afterEach, beforeEach, setSystemTime } from "bun:test"
import type { PrCheck, PrInfo } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import { mountRenderable, pinStdoutColumns } from "../testing/frame"
import { prInfo, previews, PR_NOW, ago } from "../testing/pr-info"
import { find, PR_FILES } from "../testing/pr-info-panel"
import { PRInfoPanelClass } from "./PRInfoPanel"

// What the reader sees on opening a review: one screen of headers that each
// say enough to decide which to open, or the ones they opened for this review
// last time (specs 067, 108).

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

const blocked = (): PrInfo =>
  prInfo("Adds the **skill**.\n\nSecond line with `code`.", {
    baseRef: "main",
    mergeable: "MERGEABLE",
    mergeStateStatus: "BLOCKED",
    reviewDecision: "APPROVED",
    requiredApprovals: 1,
    reviews: [{ id: "PRR_alice", author: "alice", state: "APPROVED", submittedAt: ago(30) }],
    requestedReviewers: [],
    checks: [check(1, "build"), check(2, "lint", { conclusion: "failure", annotationsStatus: "loaded", annotations: [] })],
  })

let panel: PRInfoPanelClass | null = null
let screen: Awaited<ReturnType<typeof mountRenderable>> | null = null
let restoreColumns: (() => void) | null = null

beforeEach(() => {
  setSystemTime(PR_NOW)
  restoreColumns = pinStdoutColumns(100)
})

afterEach(async () => {
  panel?.destroy()
  panel = null
  await screen?.dispose()
  screen = null
  restoreColumns?.()
  setSystemTime()
})

async function arrive(openSections?: ReadonlySet<PRInfoPanelSection>): Promise<string[]> {
  screen = await mountRenderable(
    (renderer) => {
      panel = new PRInfoPanelClass(renderer, blocked(), PR_FILES, [], openSections)
      panel.setBehindBy(0)
      panel.setPreviews(previews())
      return panel.getContainer()
    },
    { width: 100, height: 40 },
  )
  return (await screen.frame()).split("\n")
}

const headerOf = (lines: string[], title: string) => lines[find(lines, title)[1]]!

describe("arriving on a review", () => {
  test("with nothing opened before draws the description open and every other header folded, the merge status naming what blocks", async () => {
    const lines = await arrive()
    expect(headerOf(lines, "Merge status")).toBe("  ▶  Merge status  ✗ blocked · lint failing")
    expect(headerOf(lines, "Description")).toStartWith("  ▼  Description")
    for (const title of ["Previews", "Conversation", "Files", "Commits"]) {
      expect(headerOf(lines, title)).toStartWith(`  ▶  ${title}`)
    }
    const screenText = lines.join("\n")
    expect(screenText.match(/▼/g)).toHaveLength(1)
    expect(screenText).toContain("Second line")
    expect(screenText).not.toContain("build")
    expect(screenText).not.toContain("src/greet.ts")
  })

  test("with Files opened before draws Files open and the rest folded", async () => {
    const lines = await arrive(new Set(["files"]))
    expect(headerOf(lines, "Files")).toStartWith("  ▼  Files")
    expect(lines.join("\n")).toContain("src/greet.ts")
    for (const title of ["Merge status", "Description", "Previews", "Conversation", "Commits"]) {
      expect(headerOf(lines, title)).toStartWith(`  ▶  ${title}`)
    }
    expect(lines.join("\n")).not.toContain("Second line")
  })
})
