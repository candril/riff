import { test, expect, afterEach, describe } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile, doc } from "../diff-rows/fixtures"
import { cellOfColumn, columnOfCell } from "../split-view/layout"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSearchState } from "../vim-diff/search-state"
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

// Rows 7-9 draw five lines, but in the mapping the removal run ends in its no-newline marker
// before the additions start, so lines 7-12 take in a sixth that row 10 draws.
test("the status bar counts the rows a split selection spans", async () => {
  const { split, select, vimState } = await mount()
  const rows = split.source().rows
  split.source().setSide("right")
  select((rows[7] as { index: number }).index, (rows[9] as { right: number }).right)
  expect(selectionStatus(vimState())?.lines).toBe(6)
  expect(split.selectionStatus(vimState())).toEqual({ mode: "visual-line", lines: 3 })
})

describe("single-file mode", () => {
  // Each file's addition is far wider than an 80-cell pane, behind four tabs.
  const wide = (name: string) =>
    diffFile(name, ["@@ -1,1 +1,1 @@", `-${name} old`, `+\t\t\t\tconst ${name} = "${"x".repeat(200)}"`])
  const files = [wide("a.ts"), wide("b.ts")]

  async function mountSingle() {
    setup = await createTestRenderer({ width: 160, height: 30 })
    let state: AppState = { ...createInitialState(files, [], "", ""), viewMode: "diff", splitView: true, selectedFileIndex: 0 }
    let mapping = new DiffLineMapping(files, "single", 0)
    let vimState: VimCursorState = createCursorState()
    const diff = createSplitDiff({
      renderer: setup.renderer,
      parses: new FileParses(async () => null),
      scrollOff: 2,
      getState: () => state,
      getMapping: () => mapping,
      getVimState: () => vimState,
      filePanelWidth: () => 0,
      render: () => {},
      onShownChanged: () => {},
    })
    split = diff
    setup.renderer.root.add(diff.island.host)
    diff.syncDrawn(true, 30)
    const draw = () =>
      diff.draw({ mapping, state, vimState, searchState: createSearchState(), flashState: createFlashState() })
    const addition = () => mapping.allLines.findIndex((line) => line.type === "addition")
    const deletion = () => mapping.allLines.findIndex((line) => line.type === "deletion")
    draw()
    return {
      diff,
      draw,
      addition,
      deletion,
      content: (line: number) => mapping.getLine(line)!.content,
      /** Puts the cursor on `line` at `col` and reveals it, as a motion does. */
      moveTo(line: number, col: number) {
        vimState = { ...vimState, line, col }
        diff.refreshCursor()
      },
      showFile(index: number) {
        state = { ...state, selectedFileIndex: index }
        mapping = new DiffLineMapping(files, "single", index)
      },
      /** A fold or an expansion: the same file, a new mapping. */
      rebuild() {
        mapping = new DiffLineMapping(files, "single", state.selectedFileIndex ?? undefined)
      },
    }
  }

  test("flash's fallback window is the cursor line's, in columns rather than cells", async () => {
    const { diff, addition, content: contentOf, moveTo } = await mountSingle()
    const line = addition()
    moveTo(line, 150)
    const region = diff.visibleRegion()
    const content = contentOf(line)
    const window = diff.island.lineWindow(line)
    expect(window.startCol).toBeGreaterThan(0)
    expect({ startCol: region.startCol, endCol: region.endCol }).toEqual(window)
    // Behind the `‹`, a cell that four two-cell tabs put four columns before itself.
    expect(cellOfColumn(content, region.startCol) - region.startCol).toBe(4)
    expect(columnOfCell(content, cellOfColumn(content, region.startCol))).toBe(region.startCol)
  })

  test("moving to another file draws both panes from their first column, and a fold keeps them", async () => {
    const { diff, draw, addition, deletion, moveTo, showFile, rebuild } = await mountSingle()
    moveTo(addition(), 150)
    moveTo(deletion(), 3)
    expect(diff.source().side).toBe("left")
    const scrolled = diff.island.lineWindow(addition())
    expect(scrolled.startCol).toBeGreaterThan(0)

    rebuild()
    draw()
    expect(diff.island.lineWindow(addition())).toEqual(scrolled)

    showFile(1)
    draw()
    expect(diff.island.lineWindow(addition()).startCol).toBe(0)
    expect(diff.island.lineWindow(deletion()).startCol).toBe(0)
  })
})
