import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { doc } from "../diff-rows/fixtures"
import { createInitialState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"
import { selectionStatus } from "./selection-status"
import { createSplitDiff, type SplitDiff } from "./split-diff"

let setup: TestRendererSetup | null = null
let split: SplitDiff | null = null

afterEach(() => {
  split?.dispose()
  setup?.renderer.destroy()
  split = null
  setup = null
})

/** Row 8 of the fixture pairs a removal on the left with an addition on the right. */
async function mount() {
  setup = await createTestRenderer({ width: 160, height: 30 })
  const mapping = new DiffLineMapping([doc], "all")
  const state = { ...createInitialState([doc], [], "", ""), viewMode: "diff" as const, splitView: true }
  let vimState: VimCursorState = createCursorState()
  let shownChanges = 0
  split = createSplitDiff({
    renderer: setup.renderer,
    parses: new FileParses(async () => null),
    scrollOff: 2,
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => 0,
    render: () => {},
    onShownChanged: () => shownChanges++,
  })
  const pair = split.source().rows[8] as { kind: "pair"; left: number; right: number }
  return {
    split,
    pair,
    moveTo: (line: number) => (vimState = { ...vimState, line }),
    select: (anchor: number, line: number) =>
      (vimState = { ...vimState, mode: "visual-line", selectionAnchor: anchor, line }),
    vimState: () => vimState,
    resize: (width: number) => setup!.resize(width, 30),
    shownChanges: () => shownChanges,
  }
}

// A jump back assigns the cursor and draws; nothing calls refreshCursor on the way.
test("a cursor assigned to the inactive half pulls the pane over when it is drawn", async () => {
  const { split, pair, moveTo } = await mount()
  split.source().setSide("right")
  moveTo(pair.left)
  split.syncPane()
  expect(split.source().side).toBe("left")
  moveTo(pair.right)
  split.syncPane()
  expect(split.source().side).toBe("right")
})

test("revealing a cursor on the inactive half moves the pane and the drawn cursor with it", async () => {
  const { split, pair, moveTo } = await mount()
  split.source().setSide("right")
  moveTo(pair.left)
  split.revealCursor()
  expect(split.source().side).toBe("left")
  expect(split.cursorRow()).toBe(8)
})

test("a resize across 120 columns asks for the view to be swapped, and one that stays on a side does not", async () => {
  const { split, resize, shownChanges } = await mount()
  split.syncDrawn(true, 20)
  resize(150)
  expect(shownChanges()).toBe(0)
  resize(110)
  expect(shownChanges()).toBe(1)
  split.syncDrawn(false, 20)
  resize(115)
  expect(shownChanges()).toBe(1)
  resize(160)
  expect(shownChanges()).toBe(2)
})

test("a comment's scope is read in the pane a jump landed in", async () => {
  const { split, pair, moveTo } = await mount()
  split.source().setSide("right")
  moveTo(pair.left)
  expect(split.commentScope()).toEqual({ lines: [pair.left], pane: "left" })
})

// Rows 7-9 are a divider and two pairs, which is six lines of the mapping.
test("the status bar counts the rows a split selection spans", async () => {
  const { split, select, vimState } = await mount()
  const rows = split.source().rows
  split.source().setSide("right")
  select((rows[7] as { index: number }).index, (rows[9] as { right: number }).right)
  expect(selectionStatus(vimState())?.lines).toBe(6)
  expect(split.selectionStatus(vimState())).toEqual({ mode: "visual-line", lines: 3 })
})
