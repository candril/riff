import { describe, expect, test } from "bun:test"
import {
  columnWidths,
  DIFF_MIN_WIDTH,
  fileTreeWidth,
  SIDE_COLUMN_MIN_WIDTH,
  TREE_MIN_WIDTH,
  type OpenColumns,
} from "./column-widths"
import { commentPanelWidth } from "../features/inline-comment-overlay/width"
import { chatColumnWidth } from "../features/chat/width"

const open = ({
  tree = true,
  treeExpanded = false,
  threads = true,
  threadsExpanded = false,
  chat = true,
}: { tree?: boolean; treeExpanded?: boolean; threads?: boolean; threadsExpanded?: boolean; chat?: boolean } = {}): OpenColumns => ({
  tree: { visible: tree, expanded: treeExpanded },
  threads: { open: threads, expanded: threadsExpanded },
  chat: { open: chat },
})

const total = (widths: { tree: number; threads: number; chat: number; diff: number }) =>
  widths.tree + widths.threads + widths.chat + widths.diff

const SCREENS = [0, 10, 30, 50, 60, 80, 100, 120, 150, 200, 300]
const LAYOUTS = [
  open(),
  open({ treeExpanded: true }),
  open({ threadsExpanded: true }),
  open({ treeExpanded: true, threadsExpanded: true }),
  open({ chat: false }),
  open({ threads: false }),
  open({ tree: false }),
  open({ tree: false, threads: false, chat: false }),
]

describe("on a screen where every column fits", () => {
  test("at 200 columns each column keeps the width it asks for", () => {
    expect(columnWidths(200, open())).toEqual({
      tree: 35,
      threads: commentPanelWidth(200, false),
      chat: chatColumnWidth(200),
      diff: 200 - 35 - commentPanelWidth(200, false) - chatColumnWidth(200),
    })
  })

  test("an expanded tree takes 45% of the screen and an expanded thread panel its wider target", () => {
    expect(columnWidths(300, open({ chat: false, treeExpanded: true }))).toEqual({
      tree: fileTreeWidth(300, true),
      threads: commentPanelWidth(300, false),
      chat: 0,
      diff: 300 - fileTreeWidth(300, true) - commentPanelWidth(300, false),
    })
    expect(columnWidths(300, open({ threadsExpanded: true })).threads).toBe(commentPanelWidth(300, true))
  })

  test("a closed column takes no width", () => {
    expect(columnWidths(120, open({ tree: false, threads: false, chat: false }))).toEqual({ tree: 0, threads: 0, chat: 0, diff: 120 })
  })
})

describe("on a screen too narrow for every column", () => {
  test("at 80 columns with the tree, the threads and the chat the diff keeps its floor", () => {
    const widths = columnWidths(80, open())
    expect(widths.diff).toBeGreaterThanOrEqual(DIFF_MIN_WIDTH)
    expect(total(widths)).toBeLessThanOrEqual(80)
    expect(Math.min(widths.tree, widths.threads, widths.chat)).toBeGreaterThan(0)
  })

  test("the chat and the threads give way before the tree does", () => {
    const widths = columnWidths(140, open())
    expect(widths.tree).toBe(35)
    expect(widths.threads).toBeLessThan(commentPanelWidth(140, false))
    expect(widths.chat).toBeLessThan(chatColumnWidth(140))
    expect(Math.min(widths.threads, widths.chat)).toBeGreaterThanOrEqual(SIDE_COLUMN_MIN_WIDTH)
    expect(widths.diff).toBe(DIFF_MIN_WIDTH)
  })

  test("the tree gives way once the chat and the threads are down to their floors", () => {
    const widths = columnWidths(116, open())
    expect([widths.threads, widths.chat]).toEqual([SIDE_COLUMN_MIN_WIDTH, SIDE_COLUMN_MIN_WIDTH])
    expect(widths.tree).toBeLessThan(35)
    expect(widths.tree).toBeGreaterThanOrEqual(TREE_MIN_WIDTH)
    expect(widths.diff).toBe(DIFF_MIN_WIDTH)
  })

  test("an expanded thread panel gives way as well", () => {
    const widths = columnWidths(120, open({ chat: false, threadsExpanded: true }))
    expect(widths.threads).toBe(120 - 35 - DIFF_MIN_WIDTH)
    expect(widths.diff).toBe(DIFF_MIN_WIDTH)
  })

  test("an expanded tree gives way as well", () => {
    const widths = columnWidths(100, open({ threads: false, chat: false, treeExpanded: true }))
    expect(fileTreeWidth(100, true)).toBe(45)
    expect(widths).toEqual({ tree: 45, threads: 0, chat: 0, diff: 55 })
    const narrow = columnWidths(70, open({ threads: false, chat: false, treeExpanded: true }))
    expect(narrow).toEqual({ tree: 70 - DIFF_MIN_WIDTH, threads: 0, chat: 0, diff: DIFF_MIN_WIDTH })
  })

  test("at 50 columns the side columns share what the diff's floor leaves, and nothing is negative", () => {
    const widths = columnWidths(50, open({ chat: false }))
    expect(widths.diff).toBe(DIFF_MIN_WIDTH)
    expect(widths.tree + widths.threads).toBe(50 - DIFF_MIN_WIDTH)
    expect(Math.min(widths.tree, widths.threads)).toBeGreaterThanOrEqual(0)
  })

  test("a screen narrower than the diff's floor is all diff", () => {
    expect(columnWidths(30, open())).toEqual({ tree: 0, threads: 0, chat: 0, diff: 30 })
  })
})

test("on every screen the columns fill it exactly and none is negative", () => {
  for (const screen of SCREENS) {
    for (const layout of LAYOUTS) {
      const widths = columnWidths(screen, layout)
      expect(total(widths)).toBe(screen)
      expect(Math.min(widths.tree, widths.threads, widths.chat, widths.diff)).toBeGreaterThanOrEqual(0)
      if (screen >= DIFF_MIN_WIDTH) expect(widths.diff).toBeGreaterThanOrEqual(DIFF_MIN_WIDTH)
    }
  }
})
