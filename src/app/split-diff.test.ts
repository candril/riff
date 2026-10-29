import { test, expect, afterEach, describe } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile, doc } from "../diff-rows/fixtures"
import { fileAsDiff } from "../providers/files"
import { parseDiff, type DiffFile } from "../utils/diff-parser"
import { cellOfColumn, columnOfCell } from "../diff-rows/cells"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { FlashHandler } from "../vim-diff/flash-handler"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { selectionStatus } from "./selection-status"
import { createDiffHighlights } from "./diff-highlights"
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
  let state: AppState = { ...createInitialState([doc], [], "", ""), viewMode: "diff" as const }
  let vimState: VimCursorState = createCursorState()
  let shownChanges = 0
  split = createSplitDiff({
    renderer: setup.renderer,
    highlights: createDiffHighlights(new FileParses(async () => null), () => {}),
    scrollOff: 2,
    getState: () => state,
    diffOptions: { splitView: () => true },
    fileContent: { expanding: () => null },
    chatColumn: { open: () => false, expanded: () => false },
    getMapping: () => mapping,
    getVimState: () => vimState,
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
    setPanel: (panel: { open: boolean; expanded?: boolean }) =>
      (state = {
        ...state,
        inlineCommentOverlay: { ...state.inlineCommentOverlay, open: panel.open, expanded: panel.expanded ?? false },
      }),
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

describe("with the thread panel docked beside the diff", () => {
  test("split gives way to unified while the panel leaves the pane under 120 columns, and comes back when it closes", async () => {
    const { split, setPanel } = await mount()
    expect(split.shown()).toBe(true)
    setPanel({ open: true })
    expect(split.shown()).toBe(false)
    setPanel({ open: false })
    expect(split.shown()).toBe(true)
  })

  test("Ctrl-e's wider panel takes split away where the narrow one leaves room for it", async () => {
    const { split, setPanel, resize } = await mount()
    resize(200)
    setPanel({ open: true })
    expect(split.shown()).toBe(true)
    setPanel({ open: true, expanded: true })
    expect(split.shown()).toBe(false)
  })

  test("a resize that leaves too little room beside the open panel asks for the view to be swapped", async () => {
    const { split, setPanel, resize, shownChanges } = await mount()
    resize(240)
    setPanel({ open: true })
    split.syncDrawn(split.shown(), 28)
    const before = shownChanges()
    resize(170)
    expect(split.shown()).toBe(false)
    expect(shownChanges()).toBe(before + 1)
  })
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
  const twoFiles = [wide("a.ts"), wide("b.ts")]

  async function mountSingle(files = twoFiles) {
    setup = await createTestRenderer({ width: 160, height: 30 })
    let state: AppState = { ...createInitialState(files, [], "", ""), viewMode: "diff", selectedFileIndex: 0 }
    let mapping = new DiffLineMapping(files, "single", 0)
    let vimState: VimCursorState = createCursorState()
    const diff = createSplitDiff({
      renderer: setup.renderer,
      highlights: createDiffHighlights(new FileParses(async () => null), () => {}),
      scrollOff: 2,
      getState: () => state,
      diffOptions: { splitView: () => true },
      fileContent: { expanding: () => null },
      chatColumn: { open: () => false, expanded: () => false },
      getMapping: () => mapping,
      getVimState: () => vimState,
      onShownChanged: () => {},
    })
    split = diff
    setup.renderer.root.add(diff.island.host)
    diff.syncDrawn(true, 30)
    const draw = () =>
      diff.draw({ mapping, state, vimState, searchState: createSearchState(), flashState: createFlashState(), blameColumns: new Map(), marks: [] })
    const addition = () => mapping.allLines.findIndex((line) => line.type === "addition")
    const deletion = () => mapping.allLines.findIndex((line) => line.type === "deletion")
    draw()
    const frame = async () => {
      await setup!.renderOnce()
      await setup!.renderOnce()
      return setup!.captureCharFrame()
    }
    return {
      diff,
      draw,
      frame,
      addition,
      deletion,
      mapping: () => mapping,
      cursor: () => vimState,
      content: (line: number) => mapping.getLine(line)!.content,
      lineStarting: (text: string) => mapping.allLines.findIndex((line) => line.content.startsWith(text)),
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

  test("after a file switch both panes draw their lines from the start, with no ‹ left over", async () => {
    const { draw, frame, addition, deletion, moveTo, showFile } = await mountSingle()
    moveTo(addition(), 150)
    moveTo(deletion(), 3)
    expect(await frame()).toContain("‹")

    showFile(1)
    draw()
    const after = await frame()
    expect(after).not.toContain("‹")
    expect(after).toContain("b.ts old")
    expect(after).toContain('const b.ts = "xxx')
  })

  test("flash labels a context line's match in each pane, each in its own window, and a removal's on the left alone", async () => {
    const context = `qz start ${"x".repeat(200)} qz end`
    const file = diffFile("both.ts", ["@@ -1,2 +1,2 @@", ` ${context}`, "-qz old", "+new"])
    const { diff, mapping, cursor, lineStarting, moveTo } = await mountSingle([file])
    const shared = lineStarting("qz start")
    const removed = lineStarting("qz old")
    moveTo(shared, context.length - 1)
    expect(diff.source().side).toBe("right")
    const right = diff.island.lineWindow(shared)
    expect(right.startCol).toBeGreaterThan(0)

    let flashState = createFlashState()
    const jumps: [number, number, string | undefined][] = []
    const handler = new FlashHandler({
      getMapping: mapping,
      getFlashState: () => flashState,
      setFlashState: (state) => { flashState = state },
      getCursor: cursor,
      // As app.ts lands a jump: the pane first, so the reveal scrolls the pane the label was in.
      setCursor: (line, col, pane) => {
        jumps.push([line, col, pane])
        if (pane) diff.source().setSide(pane)
        moveTo(line, col)
      },
      getVisibleRegion: () => diff.visibleRegion(),
      jumpToRow: () => {},
      onUpdate: () => {},
    })
    handler.start()
    handler.handleChar("q")
    handler.handleChar("z")

    const onShared = flashState.matches.filter((match) => match.line === shared)
    expect(onShared.map((match) => [match.pane, match.startCol])).toEqual([
      ["right", context.indexOf("qz end")],
      ["left", 0],
    ])
    expect(new Set(onShared.map((match) => match.label)).size).toBe(2)
    expect(onShared.every((match) => match.label !== null)).toBe(true)
    for (const match of onShared) {
      const window = match.pane === "right" ? right : { startCol: 0, endCol: diff.island.lineWindow(removed).endCol }
      expect(match.startCol).toBeGreaterThanOrEqual(window.startCol)
      expect(match.endCol).toBeLessThanOrEqual(window.endCol)
    }
    expect(flashState.matches.filter((match) => match.line === removed).map((match) => match.pane)).toEqual(["left"])

    handler.handleChar(onShared[1]!.label!)
    expect(jumps).toEqual([[shared, 0, "left"]])
    expect(diff.source().side).toBe("left")
  })

  const wideSource = ["short", `const wide = "${"y".repeat(200)}" // the end`, "tail"]
  const asFileMode = (): DiffFile => ({ ...parseDiff(fileAsDiff("open.ts", wideSource.join("\n") + "\n"))[0]!, status: "unchanged" })
  const asNewFile = (): DiffFile => ({
    ...diffFile("new.ts", ["@@ -0,0 +1,3 @@", ...wideSource.map((line) => `+${line}`)]),
    status: "added",
  })

  // Both shapes put the wide line only in the new pane: file mode shows it as context, a new file as an addition.
  for (const [shape, file] of [["file mode", asFileMode], ["a new file", asNewFile]] as const) {
    test(`in ${shape}, $ on a line wider than the pane scrolls the new pane to its end`, async () => {
      const { diff, frame, content, lineStarting, moveTo } = await mountSingle([file()])
      const wideLine = lineStarting("const wide")
      expect(await frame()).not.toContain("‹")

      moveTo(wideLine, content(wideLine).length - 1)
      expect(diff.source().side).toBe("right")
      const after = await frame()
      expect(after).toContain("‹")
      expect(after).toContain("// the end")
    })
  }
})
