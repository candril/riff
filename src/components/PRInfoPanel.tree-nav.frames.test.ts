import { test, expect } from "bun:test"
import type { PrCheck } from "../providers/github/types"
import { bgAt, ints } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { find, pressFold, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// `l` and `h` walk the merge status as a tree from the folded overview:
// into the section, onto its checks line, onto a check, and back up onto
// the line without folding it (spec 067).

const mount = usePrInfoPanel()

const check = (id: number, name: string): PrCheck => ({
  id,
  name,
  status: "completed",
  conclusion: "success",
  detailsUrl: null,
  startedAt: null,
  completedAt: null,
  isRequired: true,
})

const info = prInfo("Adds the skill.", { checks: [check(1, "build"), check(2, "lint")] })

test("l opens Merge status, steps onto its Checks line and onto a check, and h climbs back to the line, still open", async () => {
  const { lines, panel, mounted } = await mount({ info, openSections: [], prepare: (p) => p.setActiveSection("checks") })
  expect(lines.join("\n")).toContain("▶  Merge status")

  /** The frame after a key, and which of `rows` has the cursor's surface0 behind it. */
  const after = async (op: "l" | "h", rows: string[]) => {
    pressFold(panel, op)
    const lines = (await mounted.frame()).split("\n")
    const spans = mounted.setup.captureSpans()
    const cursor = rows.filter((row) => {
      const [x, y] = find(lines, row)
      return JSON.stringify(bgAt(spans, x, y)) === JSON.stringify(ints(theme.surface0))
    })
    return { frame: lines.join("\n"), cursor }
  }
  const rows = ["Merge status", "Checks ", "build"]

  const opened = await after("l", rows)
  expect(opened.frame).toContain("▼  Merge status")
  expect(opened.frame).toContain("Checks         2/2 passed  ▼")
  expect(opened.cursor).toEqual(["Merge status"])

  const onLine = await after("l", rows)
  expect(onLine.frame).toContain("Checks         2/2 passed  ▼")
  expect(onLine.cursor).toEqual(["Checks "])

  const onCheck = await after("l", rows)
  expect(onCheck.frame).toContain("✓ build")
  expect(onCheck.cursor).toEqual(["build"])

  const back = await after("h", rows)
  expect(back.frame).toContain("Checks         2/2 passed  ▼")
  expect(back.frame).toContain("✓ build")
  expect(back.cursor).toEqual(["Checks "])
})
