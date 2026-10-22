import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile } from "../diff-rows/fixtures"
import { CURSOR_ADDITION_BG, CURSOR_LINE_BG } from "../diff-rows/line-colors"
import { contentOrigin, gutterWidth, paneWidths } from "../split-view/layout"
import { createInitialState, type AppState } from "../state"
import { bgAt, ints } from "../testing/split-frame"
import { theme } from "../theme"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { VimMotionHandler } from "../vim-diff/motion-handler"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { createHelpState } from "../features/help/state"
import { createDiffHighlights } from "./diff-highlights"
import { diffCursorShown } from "./diff-focus"
import { toLineState, toRowState } from "./split-cursor"
import { createSplitDiff, type SplitDiff } from "./split-diff"

let setup: TestRendererSetup | null = null
let split: SplitDiff | null = null

afterEach(() => {
  split?.dispose()
  setup?.renderer.destroy()
  split = null
  setup = null
})

/**
 *  row  left      right
 *   0   uneven.ts (header)
 *   1   ctx       ctx
 *   2   gone a    kept
 *   3   gone b    (empty)
 *   4   gone c    (empty)
 */
const uneven = diffFile("uneven.ts", ["@@ -1,4 +1,2 @@", " ctx", "-gone a", "-gone b", "-gone c", "+kept"])
const WIDTH = 160
const RIGHT_X = paneWidths(WIDTH).left

/** split-diff drawn, with app.ts's motion wiring: the handler walks rows, the app keeps lines. */
async function mount() {
  setup = await createTestRenderer({ width: WIDTH, height: 12 })
  const files = [uneven]
  const state: AppState = { ...createInitialState(files, [], "", ""), viewMode: "diff", splitView: true }
  const help = createHelpState()
  const mapping = new DiffLineMapping(files, "all")
  let vimState: VimCursorState = createCursorState()
  const diff = createSplitDiff({
    renderer: setup.renderer,
    highlights: createDiffHighlights(new FileParses(async () => null), () => {}),
    scrollOff: 2,
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => 0,
    onShownChanged: () => {},
  })
  split = diff
  setup.renderer.root.add(diff.island.host)
  diff.syncDrawn(true, 12)
  // As the frame pass hands split its focus: the draw, then the diff's focus.
  const draw = () => {
    diff.draw({ mapping, state, vimState, searchState: createSearchState(), flashState: createFlashState() })
    diff.island.update({ focused: diffCursorShown(state, { prompt: false, help: help.open(), confirm: false, syncPreview: false, reviewPreview: false, filePicker: false, commentsPicker: false, occurrencePicker: false, marksPicker: false, commitPicker: false, actionMenu: false, linePeek: false, blamePeek: false }) })
  }
  const handler = new VimMotionHandler({
    getMapping: () => diff.source(),
    getState: () => toRowState(vimState, diff.source()),
    setState: (next) => {
      vimState = toLineState(next, diff.source(), vimState)
      diff.refreshCursor()
    },
    getViewportHeight: () => 12,
    onCursorMove: () => diff.refreshCursor(),
  })
  const line = (content: string) => mapping.allLines.findIndex((shown) => shown.content === content)
  return {
    diff,
    line,
    codeX: RIGHT_X + contentOrigin(gutterWidth(mapping)),
    draw,
    spans: async () => {
      await setup!.renderOnce()
      await setup!.renderOnce()
      return setup!.captureSpans()
    },
    press: (key: string) => {
      handler.handleKey({ name: key, sequence: key })
      draw()
    },
    moveTo(to: number, col = 0) {
      vimState = { ...vimState, line: to, col }
      diff.refreshCursor()
      draw()
    },
    toggleHelp: () => {
      help.toggle()
      draw()
    },
    cursor: () => vimState,
  }
}

test("the help open over split hands the island an unfocused view, so no block is drawn on the cursor's half", async () => {
  const { diff, line, codeX, moveTo, toggleHelp, spans } = await mount()
  moveTo(line("kept"), 2)
  const row = diff.cursorRow()
  const blockX = codeX + 2
  expect(bgAt(await spans(), blockX, row)).toEqual(ints(theme.rosewater))

  toggleHelp()
  const covered = await spans()
  for (let x = 0; x < WIDTH; x++) expect(bgAt(covered, x, row)).not.toEqual(ints(theme.rosewater))
  expect(bgAt(covered, blockX, row)).toEqual(ints(CURSOR_ADDITION_BG))

  toggleHelp()
  expect(bgAt(await spans(), blockX, row)).toEqual(ints(theme.rosewater))
})

// tenor decided the same: motions move by rows, and only flash or a search names a pane to switch to.
test("j onto a row with nothing on the right keeps the right pane, on the removal's line, and k comes back", async () => {
  const { diff, line, moveTo, press, spans, cursor } = await mount()
  moveTo(line("kept"))
  expect(diff.source().side).toBe("right")
  expect(diff.cursorRow()).toBe(2)

  press("j")
  expect(diff.source().side).toBe("right")
  expect(diff.cursorRow()).toBe(3)
  expect(cursor().line).toBe(line("gone b"))
  // The empty right half is the one lit as the cursor line; the removal beside it keeps its own colour.
  const drawn = await spans()
  expect(bgAt(drawn, RIGHT_X + 10, 3)).toEqual(ints(CURSOR_LINE_BG))
  expect(bgAt(drawn, 10, 3)).not.toEqual(ints(CURSOR_LINE_BG))

  press("k")
  expect(diff.source().side).toBe("right")
  expect(cursor().line).toBe(line("kept"))
})
