import { test, expect } from "bun:test"
import { bgAt, ints } from "../testing/frame"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"
import { theme } from "../theme"

// `zM` and `zm` fold every section; a cursor left on a row would sit on one
// no longer drawn, so it climbs onto its section's header, as `zc` does
// (spec 067).

const mount = usePrInfoPanel()

test("folding every section with the cursor on a file puts the cursor on the Files header", async () => {
  const { panel, mounted } = await mount({
    openSections: ["files"],
    prepare: (p) => {
      p.setActiveSection("files")
      p.moveCursor(2)
    },
  })
  expect(panel.getCursorIndex()).toBe(1)

  panel.collapseAllSections()
  const lines = (await mounted.frame()).split("\n")
  expect(panel.getActiveSection()).toBe("files")
  expect(panel.getCursorIndex()).toBe(-1)
  expect(lines.join("\n")).not.toContain("src/greet.ts")
  expect(bgAt(mounted.setup.captureSpans(), ...find(lines, "▶  Files"))).toEqual(ints(theme.surface0))
})
