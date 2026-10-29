import { test, expect, describe } from "bun:test"
import { diffPaneHeight, diffPaneWidthOf, splitShown, SPLIT_MIN_WIDTH } from "./diff-layout"

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
})

test("the diff's pane is the screen less the header and the status bar", () => {
  expect(diffPaneHeight(40)).toBe(38)
  expect(diffPaneHeight(1)).toBe(0)
})

describe("the pane the views draw the diff in", () => {
  const withPanel = (open: boolean, viewMode: "diff" | "state" | "feed" = "diff", chatOpen = false) => ({
    showFilePanel: true,
    filePanelExpanded: false,
    viewMode,
    chatOpen,
    chatExpanded: false,
    inlineCommentOverlay: { open, expanded: false },
  })

  test("gives up the open thread panel's columns as well as the tree's", () => {
    expect(diffPaneWidthOf(withPanel(true), 240)).toBe(141)
    expect(splitShown(true, diffPaneWidthOf(withPanel(true), 240), 10)).toBe(true)
  })

  test("falls back to unified where the panel leaves split too little room", () => {
    expect(diffPaneWidthOf(withPanel(true), 200)).toBe(101)
    expect(splitShown(true, diffPaneWidthOf(withPanel(true), 200), 10)).toBe(false)
  })

  test("is the screen less the tree while the panel is closed", () => {
    expect(diffPaneWidthOf(withPanel(false), 200)).toBe(165)
  })

  test("leaves the panel out outside the diff view, where no diff is drawn beside it", () => {
    expect(diffPaneWidthOf(withPanel(true, "state"), 200)).toBe(165)
    expect(diffPaneWidthOf(withPanel(true, "feed"), 200)).toBe(165)
  })

  test("gives up the open chat's columns, and split falls back to unified where that leaves too little", () => {
    expect(diffPaneWidthOf(withPanel(false, "diff", true), 240)).toBe(149)
    expect(splitShown(true, diffPaneWidthOf(withPanel(false, "diff", true), 240), 10)).toBe(true)
    expect(diffPaneWidthOf(withPanel(false, "diff", true), 200)).toBe(109)
    expect(splitShown(true, diffPaneWidthOf(withPanel(false, "diff", true), 200), 10)).toBe(false)
    expect(diffPaneWidthOf(withPanel(true, "diff", true), 300)).toBe(145)
  })

  test("leaves the chat out outside the diff view", () => {
    expect(diffPaneWidthOf(withPanel(false, "state", true), 200)).toBe(165)
  })
})
