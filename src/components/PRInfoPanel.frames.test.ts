import { test, expect, describe, afterEach } from "bun:test"
import { PRInfoPanelClass } from "./PRInfoPanel"
import { bgAt, ints, mountRenderable } from "../testing/frame"
import { prInfo } from "../testing/pr-info"
import { theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"

const BOX_DRAWING = /[─-╿]/

const FILES: DiffFile[] = [
  { filename: "src/greet.ts", additions: 3, deletions: 1, status: "modified", content: "" },
  { filename: "src/farewell.ts", additions: 5, deletions: 0, status: "added", content: "" },
]

let mounted: Awaited<ReturnType<typeof mountRenderable>> | null = null
let panel: PRInfoPanelClass | null = null

afterEach(async () => {
  panel?.destroy()
  panel = null
  await mounted?.dispose()
  mounted = null
})

async function mountPanel(prepare: (panel: PRInfoPanelClass) => void) {
  mounted = await mountRenderable(
    (renderer) => {
      panel = new PRInfoPanelClass(renderer, prInfo("Adds the skill."), FILES)
      return panel.getContainer()
    },
    { width: 120, height: 40 }
  )
  prepare(panel!)
  const lines = (await mounted.frame()).split("\n")
  return { lines, spans: mounted.setup.captureSpans() }
}

describe("the PR comment input", () => {
  test("stands apart by shade, with the typed text on surface0", async () => {
    const { lines, spans } = await mountPanel((p) => p.updateCommentInput(true, "hello", false, null))

    const headerRow = lines.findIndex((line) => line.includes("Add PR Comment"))
    const textRow = lines.findIndex((line) => line.includes("hello"))
    const statusRow = lines.findIndex((line) => line.includes("Enter to submit"))
    expect(headerRow).toBeGreaterThanOrEqual(0)
    expect(statusRow).toBeGreaterThan(textRow)

    const left = lines[headerRow]!.indexOf("Add PR Comment") - 2
    const inputBox = lines.slice(headerRow - 1, statusRow + 2).map((line) => line.slice(left, left + 60))
    expect(inputBox.join("\n")).not.toMatch(BOX_DRAWING)

    expect(bgAt(spans, left, headerRow)).toEqual(ints(theme.mantle))
    expect(bgAt(spans, lines[textRow]!.indexOf("hello"), textRow)).toEqual(ints(theme.surface0))
  })
})

describe("the info panel", () => {
  test("marks the selected row with surface0", async () => {
    const { lines, spans } = await mountPanel((p) => {
      p.setActiveSection("files")
      p.expandSection()
      p.moveCursor(1)
    })

    const y = lines.findIndex((line) => line.includes("src/greet.ts"))
    expect(y).toBeGreaterThanOrEqual(0)
    expect(bgAt(spans, lines[y]!.indexOf("src/greet.ts"), y)).toEqual(ints(theme.surface0))
  })
})
