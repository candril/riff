import { test, expect, afterEach, describe } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile } from "../diff-rows/fixtures"
import { createInitialState, type AppState } from "../state"
import { ONE_WIDE_LINE, SIXTY_LINES, TWO_FILES } from "../testing/diffs"
import { fgAt } from "../testing/split-frame"
import { parseDiff, type DiffFile } from "../utils/diff-parser"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses, type Parse } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { createDiffHighlights } from "./diff-highlights"
import { createUnifiedDiff, type UnifiedDiff } from "./unified-diff"
import { createDiffOptionsState } from "../features/diff-view/options-state"

let setup: TestRendererSetup | null = null
let unified: UnifiedDiff | null = null

afterEach(() => {
  unified?.dispose()
  setup?.renderer.destroy()
  unified = null
  setup = null
})

const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

interface MountOptions {
  files: DiffFile[]
  width?: number
  height?: number
  /** A file's index for single-file mode; all files otherwise. */
  selectedFileIndex?: number
  wrap?: boolean
  parse?: Parse
}

/** createUnifiedDiff on a test screen, drawn as the frame pass draws it, with the app's state kept here. */
async function mount(options: MountOptions) {
  const { files, width = 80, height = 12, selectedFileIndex } = options
  setup = await createTestRenderer({ width, height })
  const mappingOf = (index: number | null) =>
    index === null ? new DiffLineMapping(files, "all") : new DiffLineMapping(files, "single", index)
  let state: AppState = {
    ...createInitialState(files, [], "", ""),
    viewMode: "diff",
    selectedFileIndex: selectedFileIndex ?? null,
  }
  const diffOptions = createDiffOptionsState({ wrap: options.wrap ?? false, alignMarkdownTables: true })
  let mapping = mappingOf(state.selectedFileIndex)
  let vimState: VimCursorState = createCursorState()
  let renders = 0
  const highlights = createDiffHighlights(
    new FileParses(async () => null),
    () => {
      renders++
      draw()
    },
    options.parse ?? (async () => null)
  )
  const diff = createUnifiedDiff({
    renderer: setup.renderer,
    highlights,
    scrollOff: 2,
    getState: () => state,
    diffOptions,
    fileContent: { expanding: () => null },
    chatColumn: { open: () => false, expanded: () => false },
    getMapping: () => mapping,
    getVimState: () => vimState,
  })
  unified = diff
  setup.renderer.root.add(diff.island.host)
  function draw() {
    diff.draw({
      mapping,
      state,
      vimState,
      searchState: createSearchState(),
      flashState: createFlashState(),
      blameColumns: new Map(),
      marks: [],
      emptyMessage: "No changes to display",
      focused: true,
    })
  }
  draw()
  diff.syncDrawn(true)
  const frame = async () => {
    await setup!.renderOnce()
    await nextTick()
    await setup!.renderOnce()
    return setup!.captureCharFrame()
  }
  await frame()
  const island = diff.island
  return {
    diff,
    island,
    draw,
    frame,
    renders: () => renders,
    mapping: () => mapping,
    lineStarting: (text: string) => mapping.allLines.findIndex((line) => line.content.startsWith(text)),
    /** As a motion does: the app's cursor first, then the reveal. */
    moveTo(line: number, col = 0) {
      vimState = { ...vimState, line, col }
      diff.refreshCursor()
    },
    /** Puts the cursor on `line` without telling the view, as a path that only assigns it does. */
    assign(line: number, col = 0) {
      vimState = { ...vimState, line, col }
    },
    showFile(index: number | null) {
      state = { ...state, selectedFileIndex: index }
      mapping = mappingOf(index)
    },
    /** A fold or an expansion: the same file, a new mapping. */
    rebuild() {
      mapping = mappingOf(state.selectedFileIndex)
    },
    toggleWrap() {
      diffOptions.toggleWrap()
    },
    /** The cursor's visual row sits inside the window, scroll-off aside. */
    cursorInWindow() {
      const row = island.cursorRow()
      return row >= island.scrollTop() && row < island.scrollTop() + island.viewportHeight()
    },
  }
}

test("draw feeds the island, and the frame shows the diff's rows and file headers", async () => {
  const { frame } = await mount({ files: parseDiff(TWO_FILES), height: 20 })
  const shown = await frame()
  expect(shown).toContain("src/greet.ts")
  expect(shown).toContain("export function greet(name: string)")
  expect(shown).toContain("src/farewell.ts")
  expect(shown).toContain('return "Bye " + name')
})

test("with nothing to draw it says why, in the message the app hands it", async () => {
  const { frame } = await mount({ files: [] })
  expect(await frame()).toContain("No changes to display")
})

describe("refreshCursor", () => {
  test("scrolls a cursor moved below the window back into it", async () => {
    const { island, frame, moveTo, cursorInWindow } = await mount({ files: parseDiff(SIXTY_LINES), height: 10 })
    moveTo(40)
    expect(island.scrollTop()).toBeGreaterThan(0)
    expect(cursorInWindow()).toBe(true)
    expect(await frame()).toContain("const line40 = 40")
  })

  test("scrolls sideways to a column past the right edge", async () => {
    const { island, lineStarting, moveTo, mapping } = await mount({ files: parseDiff(ONE_WIDE_LINE) })
    const wide = lineStarting('const wide = "')
    const col = mapping().getLine(wide)!.content.length - 1
    moveTo(wide, col)
    const window = island.lineWindow(wide)
    expect(window.startCol).toBeGreaterThan(0)
    expect(col).toBeGreaterThanOrEqual(window.startCol)
    expect(col).toBeLessThan(window.endCol)
  })

  // Line numbers of a mapping the view has not drawn mean other rows in the one it has.
  test("waits for the render when the app's mapping is not the one drawn", async () => {
    const { island, draw, assign, rebuild, diff, cursorInWindow } = await mount({
      files: parseDiff(SIXTY_LINES),
      height: 10,
    })
    rebuild()
    assign(45)
    diff.refreshCursor()
    expect(island.scrollTop()).toBe(0)
    draw()
    expect(island.scrollTop()).toBeGreaterThan(0)
    expect(cursorInWindow()).toBe(true)
  })
})

describe("the column window", () => {
  // Each file's addition is far wider than the 80-cell pane.
  const wide = (name: string) =>
    diffFile(name, ["@@ -1,1 +1,1 @@", `-${name} old`, `+const ${name} = "${"x".repeat(200)}"`])
  const twoFiles = [wide("a.ts"), wide("b.ts")]

  async function scrolledRight() {
    const mounted = await mount({ files: twoFiles, selectedFileIndex: 0 })
    const addition = () => mounted.mapping().allLines.findIndex((line) => line.type === "addition")
    mounted.moveTo(addition(), 150)
    const scrolled = mounted.island.lineWindow(addition())
    expect(scrolled.startCol).toBeGreaterThan(0)
    return { ...mounted, addition, scrolled }
  }

  test("a fold keeps the column", async () => {
    const { island, draw, rebuild, addition, scrolled } = await scrolledRight()
    rebuild()
    draw()
    expect(island.lineWindow(addition())).toEqual(scrolled)
  })

  test("another file starts from the first column", async () => {
    const { island, draw, showFile, assign, addition, frame, mapping } = await scrolledRight()
    showFile(1)
    // On riff's own row, which no reveal scrolls sideways for, so only the reset can move the window.
    const header = mapping().allLines.findIndex((line) => line.type !== "addition" && line.type !== "deletion")
    expect(["file-header", "divider", "spacing", "hunk-header"]).toContain(mapping().getLine(header)!.type)
    assign(header, 0)
    draw()
    expect(island.lineWindow(addition()).startCol).toBe(0)
    const shown = await frame()
    expect(shown).toContain('const b.ts = "xxx')
    expect(shown).not.toContain("‹")
  })

  test("so does a switch to all files", async () => {
    const { island, draw, showFile, assign, mapping } = await scrolledRight()
    showFile(null)
    assign(0, 0)
    expect(mapping().getLine(0)!.type).toBe("file-header")
    draw()
    const addition = mapping().allLines.findIndex((line) => line.type === "addition")
    expect(island.lineWindow(addition).startCol).toBe(0)
  })
})

describe("what the app asks of the view on screen", () => {
  test("the files with code on screen, the flash region and the column readout come from the island", async () => {
    const { diff, island, moveTo, lineStarting } = await mount({ files: parseDiff(TWO_FILES), height: 20 })
    expect(diff.visibleFilenames()).toEqual(["src/greet.ts", "src/farewell.ts"])
    const region = diff.visibleRegion()
    expect(region).not.toBeNull()
    expect(region!.lines).toEqual(island.visibleLines())
    expect(region!.lines).toContain(lineStarting("export function farewell"))
    moveTo(lineStarting("export function greet"), 3)
    expect(diff.columnStatus()).toBeNull()
  })

  test("the column readout counts a line too wide for its window", async () => {
    const { diff, lineStarting, moveTo, mapping } = await mount({ files: parseDiff(ONE_WIDE_LINE) })
    const wide = lineStarting('const wide = "')
    moveTo(wide, 10)
    expect(diff.columnStatus()).toEqual({ col: 11, total: mapping().getLine(wide)!.content.length })
  })

  test("the viewport is the island's height once laid out", async () => {
    const { diff } = await mount({ files: parseDiff(SIXTY_LINES), height: 10 })
    expect(diff.viewportHeight()).toBe(10)
  })

  test("a wheel that scrolls the cursor away tells the app where to drag it", async () => {
    const { diff } = await mount({ files: parseDiff(SIXTY_LINES), height: 10 })
    const dragged: number[] = []
    diff.setOnCursorScrolledAway((line) => dragged.push(line))
    for (let tick = 0; tick < 5; tick++) {
      await setup!.mockMouse.scroll(10, 3, "down")
      await setup!.renderOnce()
    }
    expect(dragged.length).toBeGreaterThan(0)
    expect(dragged.at(-1)).toBeGreaterThan(0)
  })
})

// The app's relay: the cursor moves, the view reveals it and the app renders, all before the next tick.
test("a burst that drags the cursor every tick counts every tick", async () => {
  const { diff, island, draw, assign, frame } = await mount({ files: parseDiff(SIXTY_LINES), height: 12 })
  diff.setOnCursorScrolledAway((line) => {
    assign(line)
    diff.refreshCursor()
    draw()
  })
  const tops = [island.scrollTop()]
  for (let burst = 0; burst < 4; burst++) {
    // On the code, whose texts the cursor recolours as it is dragged through the row under the pointer.
    for (let tick = 0; tick < 8; tick++) await setup!.mockMouse.scroll(10, 6, "down")
    await frame()
    tops.push(island.scrollTop())
  }
  expect(tops).toEqual([0, 8, 16, 24, 32])
})

// The gutter, the markers and the bar are renderables like the code, so z-order alone puts an overlay over them.
test("an overlay above the diff covers all of it, gutter and scrollbar included", async () => {
  const { frame } = await mount({ files: parseDiff(SIXTY_LINES), height: 12 })
  const before = (await frame()).split("\n")
  expect(before[3]).toContain("   3 const line3 = 3")
  setup!.renderer.root.add(
    new BoxRenderable(setup!.renderer, {
      position: "absolute",
      left: 2,
      top: 2,
      width: 78,
      height: 8,
      zIndex: 110,
      backgroundColor: "#1e1e2e",
    })
  )
  const covered = (await frame()).split("\n")
  for (let y = 2; y < 10; y++) expect(covered[y]!.slice(2).trim()).toBe("")
  expect(covered[1]).toContain("const line1 = 1")
  expect(covered[10]).toContain("const line10 = 10")
})

// Split draws its cursor as a cell of its own, so a terminal block left behind would be a second, frozen cursor.
test("the terminal cursor hides once unified stops being the drawn view", async () => {
  const { diff, island, frame } = await mount({ files: parseDiff(TWO_FILES), height: 20 })
  expect(setup!.renderer.getCursorState().visible).toBe(true)
  setup!.renderer.root.remove(island.host)
  diff.syncDrawn(false)
  await frame()
  expect(setup!.renderer.getCursorState().visible).toBe(false)
})

// Follow-up 12: the island drags the cursor only on a wheel tick, so every other path that moves the
// window or the cursor's row has to reveal the cursor itself.
describe("the cursor stays in the window", () => {
  test("across a resize that shrinks the window under it", async () => {
    const { island, frame, moveTo, cursorInWindow } = await mount({ files: parseDiff(SIXTY_LINES), height: 30 })
    moveTo(25)
    expect(island.scrollTop()).toBe(0)
    setup!.resize(80, 10)
    await frame()
    expect(island.viewportHeight()).toBe(10)
    expect(cursorInWindow()).toBe(true)
  })

  // Wrapping each line over several rows pushes the cursor's row far below where the window stood.
  const longLines = diffFile(
    "long.ts",
    ["@@ -0,0 +1,30 @@", ...Array.from({ length: 30 }, (_, i) => `+const line${i} = "${"w".repeat(150)}"`)]
  )

  test("across a wrap toggle, both ways", async () => {
    const { island, draw, toggleWrap, moveTo, lineStarting, cursorInWindow } = await mount({
      files: [longLines],
      height: 10,
    })
    moveTo(lineStarting("const line12 ="))
    const before = island.scrollTop()

    toggleWrap()
    draw()
    expect(island.cursorRow()).toBeGreaterThan(before + 10)
    expect(cursorInWindow()).toBe(true)

    toggleWrap()
    draw()
    expect(cursorInWindow()).toBe(true)
  })

  test("across a wrap toggle followed by the app's own reveal", async () => {
    const { diff, draw, toggleWrap, moveTo, lineStarting, cursorInWindow } = await mount({
      files: [longLines],
      height: 10,
    })
    moveTo(lineStarting("const line20 ="))
    toggleWrap()
    draw()
    diff.refreshCursor()
    expect(cursorInWindow()).toBe(true)
  })
})

test("a highlight landing redraws through the shared highlights", async () => {
  let answer: (() => void) | null = null
  const parse: Parse = () =>
    new Promise((resolve) => {
      answer = () => resolve([[0, 5, "keyword"]])
    })
  const { frame, renders } = await mount({ files: parseDiff(SIXTY_LINES), height: 10, parse })
  const rows = (await frame()).split("\n")
  const y = rows.findIndex((row) => row.includes("const line1 = 1"))
  const x = rows[y]!.indexOf("const")
  const plain = fgAt(setup!.captureSpans(), x, y)

  answer!()
  await nextTick()
  expect(renders()).toBe(1)
  await frame()
  expect(fgAt(setup!.captureSpans(), x, y)).not.toEqual(plain)
})
