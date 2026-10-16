import { test, expect, describe } from "bun:test"
import { diffPaneHeight, diffPaneWidth, splitShown, SPLIT_MIN_WIDTH } from "./diff-layout"

describe("when split is drawn", () => {
  test("from 120 columns of diff pane on", () => {
    expect(SPLIT_MIN_WIDTH).toBe(120)
    expect(splitShown(true, 119, 10)).toBe(false)
    expect(splitShown(true, 120, 10)).toBe(true)
  })

  test("never unless asked for", () => {
    expect(splitShown(false, 200, 10)).toBe(false)
  })

  test("never with no lines to draw, so unified can say why the diff is empty", () => {
    expect(splitShown(true, 200, 0)).toBe(false)
  })

  test("the file panel's width comes off the pane only while it is shown", () => {
    expect(diffPaneWidth(160, { visible: true, width: 35 })).toBe(125)
    expect(diffPaneWidth(150, { visible: true, width: 35 })).toBe(115)
    expect(diffPaneWidth(150, { visible: false, width: 35 })).toBe(150)
  })
})

test("the diff's pane is the screen less the header and the status bar", () => {
  expect(diffPaneHeight(40)).toBe(38)
  expect(diffPaneHeight(1)).toBe(0)
})
