import { test, expect, describe } from "bun:test"
import { diffPaneWidth, splitShown, SPLIT_MIN_WIDTH } from "./diff-layout"

describe("when split is drawn", () => {
  test("from 120 columns of diff pane on", () => {
    expect(SPLIT_MIN_WIDTH).toBe(120)
    expect(splitShown(true, 119)).toBe(false)
    expect(splitShown(true, 120)).toBe(true)
  })

  test("never unless asked for", () => {
    expect(splitShown(false, 200)).toBe(false)
  })

  test("the file panel's width comes off the pane only while it is shown", () => {
    expect(diffPaneWidth(160, { visible: true, width: 35 })).toBe(125)
    expect(diffPaneWidth(150, { visible: true, width: 35 })).toBe(115)
    expect(diffPaneWidth(150, { visible: false, width: 35 })).toBe(150)
  })
})
