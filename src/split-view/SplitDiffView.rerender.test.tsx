import { test, expect, describe, afterEach, spyOn } from "bun:test"
import { testRender } from "@opentui/solid"
import { createStore } from "solid-js/store"
import { LineSpans } from "../diff-rows/line-spans"
import { RowLineSource } from "../diff-rows/row-source"
import * as segmentsModule from "../diff-rows/segments"
import * as overlaysModule from "./overlays"
import { parseDiff } from "../utils/diff-parser"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SplitSelection } from "./overlays"
import { SplitDiffView } from "./SplitDiffView"

/*
 * How many halves rebuild their segments when the cursor, the scroll or a
 * selection moves. A frame test cannot see this: a half rebuilt to the same
 * segments draws the same cells, it only costs the time.
 */

const LINES = 40
const HEIGHT = 12
const context = Array.from({ length: LINES }, (_, n) => ` const value${n} = compute(input${n})`)
const RAW = `diff --git a/long.ts b/long.ts
index 1111111..2222222 100644
--- a/long.ts
+++ b/long.ts
@@ -1,${LINES} +1,${LINES} @@
${context.join("\n")}
`

const buildSegments = spyOn(segmentsModule, "buildSegments")
const inLineSelection = spyOn(overlaysModule, "inLineSelection")
const charSelectionOn = spyOn(overlaysModule, "charSelectionOn")
const clearCounts = () => [buildSegments, inLineSelection, charSelectionOn].forEach((spy) => spy.mockClear())
let setup: Awaited<ReturnType<typeof testRender>> | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function mount() {
  const files = parseDiff(RAW)
  const mapping = new DiffLineMapping(files, "all")
  const source = new RowLineSource(mapping, "split")
  expect(source.rows.filter((row) => row.kind === "pair").length).toBeGreaterThanOrEqual(LINES)
  const [view, setView] = createStore({
    cursor: { row: 3, col: 0 },
    scrollTop: 0,
    selection: null as SplitSelection | null,
  })
  setup = await testRender(
    () => (
      <SplitDiffView
        mapping={mapping}
        source={source}
        files={files}
        lineSpans={new LineSpans(new FileParses(async () => null), async () => null)}
        highlightVersion={0}
        comments={[]}
        fileStatuses={new Map()}
        expandingDivider={null}
        cursor={view.cursor}
        side="right"
        scrollTop={view.scrollTop}
        columns={{ left: 0, right: 0 }}
        width={120}
        height={HEIGHT}
        focused
        selection={view.selection}
        search={null}
        flash={null}
      />
    ),
    { width: 120, height: HEIGHT }
  )
  await setup.renderOnce()
  const frame = setup.captureCharFrame()
  expect(frame).toContain("const value0 = compute(input0)")
  clearCounts()
  return { setView, rendered: () => setup!.renderOnce() }
}

describe("a half rebuilds its segments only when what it draws changes", () => {
  test("moving the cursor a row rebuilds its pane's half of the row it left and the row it entered", async () => {
    const { setView, rendered } = await mount()
    setView("cursor", { row: 4, col: 0 })
    await rendered()
    // Only the right half of each: the cursor is in the right pane, and the left halves draw the same either way.
    expect(buildSegments.mock.calls.length).toBe(2)
  })

  test("scrolling a row with the cursor rebuilds the entering row and the cursor rows", async () => {
    const { setView, rendered } = await mount()
    setView({ cursor: { row: HEIGHT, col: 0 }, scrollTop: 1 })
    await rendered()
    // The row scrolled in, which the cursor entered, and the right half of the row it left.
    expect(buildSegments.mock.calls.length).toBe(3)
    // Every kept row sits where it sat, so only the entering row asks whether it is selected.
    expect(inLineSelection.mock.calls.length).toBeLessThanOrEqual(2)
    expect(charSelectionOn.mock.calls.length).toBeLessThanOrEqual(2)
  })

  test("a linewise selection growing a row rebuilds the row it took in and the cursor rows", async () => {
    const { setView, rendered } = await mount()
    setView({ selection: { mode: "visual-line", startRow: 3, startCol: 0, endRow: 3, endCol: 0 } })
    await rendered()
    clearCounts()
    setView({ cursor: { row: 4, col: 0 }, selection: { mode: "visual-line", startRow: 3, startCol: 0, endRow: 4, endCol: 0 } })
    await rendered()
    // The row it took in, which the cursor entered, and the cursor's last row; every other half stays as it was.
    expect(buildSegments.mock.calls.length).toBe(2)
  })
})
