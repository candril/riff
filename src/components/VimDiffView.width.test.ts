import { test, expect, describe, afterAll } from "bun:test"
import { Box } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { VimDiffView } from "./VimDiffView"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createCursorState } from "../vim-diff/cursor-state"
import { parseDiff } from "../utils/diff-parser"

const LONG_LINE = `const wide = ${"x".repeat(90)};`

const RAW_DIFF = `diff --git a/a.ts b/a.ts
index 1111111..2222222 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,4 @@
 const first = 1
-const gone = 2
+${LONG_LINE}
+const after = 3
 const last = 4
`

const PANE_WIDTH = 60

/**
 * The diff mounted the way the app mounts it: under a one-row header,
 * which is the offset every overlay in the view measures against.
 */
async function mountDiff() {
  const files = parseDiff(RAW_DIFF)
  const { renderer, renderOnce } = await createTestRenderer({ width: PANE_WIDTH, height: 14 })

  const shell = Box(
    { id: "shell", width: "100%", height: "100%", flexDirection: "column" },
    Box({ id: "header", width: "100%", height: 1 })
  )
  renderer.root.add(shell)

  const view = new VimDiffView({ renderer })
  ;(renderer.root.findDescendantById("shell") as unknown as { add: (c: unknown) => void })
    .add(view.getContainer())

  const mapping = new DiffLineMapping(files, "all")
  const longLine = [...Array(mapping.lineCount).keys()]
    .find((i) => (mapping.getLine(i)?.content ?? "").includes("xxx"))!

  const settle = async () => {
    await renderOnce()
    await renderOnce()
  }

  view.update(files, null, mapping, { ...createCursorState(), line: longLine, col: 0 }, [], new Map(), new Set(), null)
  await settle()

  return { view, longLine, settle }
}

const mounted = await mountDiff()

afterAll(() => {
  mounted.view.destroy()
})

describe("a diff wider than its window", () => {
  test("is laid out at the width its longest line needs", () => {
    const scrollBox = mounted.view.getScrollBox()!

    // Left to itself the code renderable clamps to the space offered,
    // which caps the scroll a few columns from zero.
    expect(scrollBox.scrollWidth).toBeGreaterThan(scrollBox.viewport.width)
    expect(scrollBox.scrollWidth).toBeGreaterThanOrEqual(LONG_LINE.length)
  })

  test("scrolls far enough to reach a column past the edge", async () => {
    const scrollBox = mounted.view.getScrollBox()!

    mounted.view.revealColumn(mounted.longLine, 80)
    await mounted.settle()

    expect(scrollBox.scrollLeft).toBeGreaterThan(0)
    // Column 80 is inside the window, with room to spare ahead of it.
    expect(scrollBox.scrollLeft).toBeLessThanOrEqual(80)
    expect(mounted.view.getColumnStatus(mounted.longLine, 80)).toEqual({
      col: 81,
      total: LONG_LINE.length,
    })
  })

  test("scrolls back when the cursor returns to the start of a line", async () => {
    const scrollBox = mounted.view.getScrollBox()!

    mounted.view.revealColumn(mounted.longLine, 0)
    await mounted.settle()

    expect(scrollBox.scrollLeft).toBe(0)
  })
})
