import { test, expect, describe } from "bun:test"
import { find, usePrInfoPanel } from "../testing/pr-info-panel"

// A refresh hands the reader's position to a panel that has never been laid out.

const mount = usePrInfoPanel()

describe("a position restored before the first frame", () => {
  test("shows the rows the reader had scrolled to, not the description's header", async () => {
    const before = await mount({ section: "commits", height: 30, prepare: (p) => p.moveCursor(15) })
    const position = before.panel.capturePosition()
    expect(position.scrollTop).toBeGreaterThan(0)

    const after = await mount({ height: 30, prepare: (p) => p.restorePosition(position) })
    expect(after.panel.getScrollBox().scrollTop).toBe(position.scrollTop)
    expect(after.lines).toEqual(before.lines)
    expect(() => find(after.lines, "Description")).toThrow()
  })

  test("gives way to a cursor move made after it", async () => {
    const before = await mount({ section: "commits", height: 30, prepare: (p) => p.moveCursor(15) })
    const position = before.panel.capturePosition()

    const after = await mount({
      height: 30,
      prepare: (p) => {
        p.restorePosition(position)
        p.jumpToTop()
      },
    })
    expect(after.panel.getScrollBox().scrollTop).toBe(0)
    find(after.lines, "Description")
  })
})
