import { test, expect, describe } from "bun:test"
import { diffPaneHeight, diffPaneWidth, diffPaneWidthOf, splitShown, SPLIT_MIN_WIDTH } from "./diff-layout"

const NO_COMMENT_PANEL = { open: false, width: 0 }

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
    expect(diffPaneWidth(160, { visible: true, width: 35 }, NO_COMMENT_PANEL)).toBe(125)
    expect(diffPaneWidth(150, { visible: true, width: 35 }, NO_COMMENT_PANEL)).toBe(115)
    expect(diffPaneWidth(150, { visible: false, width: 35 }, NO_COMMENT_PANEL)).toBe(150)
  })

  test("the thread panel's width comes off the pane only while it is open", () => {
    expect(diffPaneWidth(240, { visible: true, width: 35 }, { open: true, width: 64 })).toBe(141)
    expect(diffPaneWidth(240, { visible: false, width: 35 }, { open: true, width: 64 })).toBe(176)
    expect(diffPaneWidth(240, { visible: true, width: 35 }, { open: false, width: 64 })).toBe(205)
  })

  test("a screen narrower than both panels leaves the pane no columns rather than fewer than none", () => {
    expect(diffPaneWidth(80, { visible: true, width: 35 }, { open: true, width: 48 })).toBe(0)
  })
})

test("the diff's pane is the screen less the header and the status bar", () => {
  expect(diffPaneHeight(40)).toBe(38)
  expect(diffPaneHeight(1)).toBe(0)
})

describe("the pane the views draw the diff in", () => {
  const withPanel = (open: boolean, viewMode: "diff" | "state" | "feed" = "diff") => ({
    showFilePanel: true,
    viewMode,
    inlineCommentOverlay: { open, expanded: false },
  })

  test("gives up the open thread panel's columns as well as the tree's", () => {
    expect(diffPaneWidthOf(withPanel(true), 240, 35)).toBe(141)
    expect(splitShown(true, diffPaneWidthOf(withPanel(true), 240, 35), 10)).toBe(true)
  })

  test("falls back to unified where the panel leaves split too little room", () => {
    expect(diffPaneWidthOf(withPanel(true), 200, 35)).toBe(101)
    expect(splitShown(true, diffPaneWidthOf(withPanel(true), 200, 35), 10)).toBe(false)
  })

  test("is the screen less the tree while the panel is closed", () => {
    expect(diffPaneWidthOf(withPanel(false), 200, 35)).toBe(165)
  })

  test("leaves the panel out outside the diff view, where no diff is drawn beside it", () => {
    expect(diffPaneWidthOf(withPanel(true, "state"), 200, 35)).toBe(165)
    expect(diffPaneWidthOf(withPanel(true, "feed"), 200, 35)).toBe(165)
  })
})
