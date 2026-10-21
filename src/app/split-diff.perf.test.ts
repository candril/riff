import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState } from "../state"
import { BIG_FILES, BIG_MAPPING, BOUND_MS, medianMove } from "../testing/big-diff"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { VimMotionHandler } from "../vim-diff/motion-handler"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { toLineState, toRowState } from "./split-cursor"
import { createDiffHighlights } from "./diff-highlights"
import { createSplitDiff, type SplitDiff } from "./split-diff"

const files = BIG_FILES
const mapping = BIG_MAPPING

let setup: TestRendererSetup | null = null
let split: SplitDiff | null = null

afterEach(() => {
  split?.dispose()
  setup?.renderer.destroy()
  split = null
  setup = null
})

async function mount() {
  setup = await createTestRenderer({ width: 240, height: 50 })
  const state = { ...createInitialState(files, [], "", ""), viewMode: "diff" as const, splitView: true }
  let vimState: VimCursorState = createCursorState()
  const searchState = createSearchState()
  const flashState = createFlashState()
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
  diff.syncDrawn(true, 50)
  const draw = () => diff.draw({ mapping, state, vimState, searchState, flashState })
  draw()
  await setup.renderOnce()
  // The host's laid-out size reaches the island a tick after the frame that laid it out.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await setup.renderOnce()

  // The split calls app.ts makes for a motion: ensureCursorVisible's revealCursor, then refreshCursor.
  // Not timed: followCursorInTree (there is no tree here) and the chrome the frame's followers draw.
  const followCursor = () => {
    diff.revealCursor()
    diff.refreshCursor()
  }
  const handler = new VimMotionHandler({
    getMapping: () => diff.source(),
    getState: () => toRowState(vimState, diff.source()),
    setState: (s) => {
      vimState = toLineState(s, diff.source(), vimState)
      followCursor()
    },
    getViewportHeight: () => diff.island.viewportHeight(),
    onCursorMove: followCursor,
  })
  return { setup, handler, draw, mode: () => vimState.mode }
}

test("the fixture is a 10,000-line diff the split view draws", async () => {
  expect(mapping.lineCount).toBeGreaterThanOrEqual(10_000)
  const { setup } = await mount()
  expect(setup.captureCharFrame()).toContain('const value0 = compute(input0, { scale: 0, label: "item-0-0" })')
})

test(`a j in normal mode redraws in under ${BOUND_MS} ms`, async () => {
  const { setup, handler } = await mount()
  const median = await medianMove(
    () => handler.handleKey({ name: "j", sequence: "j" }),
    () => setup.renderOnce()
  )
  expect(median).toBeLessThan(BOUND_MS)
})

// A visual-mode move renders in the app, so each one also hands the split view a full draw.
test(`a j in a linewise selection redraws in under ${BOUND_MS} ms`, async () => {
  const { setup, handler, draw, mode } = await mount()
  handler.handleKey({ name: "v", sequence: "V", shift: true })
  const median = await medianMove(
    () => {
      handler.handleKey({ name: "j", sequence: "j" })
      draw()
    },
    () => setup.renderOnce()
  )
  expect(mode()).toBe("visual-line")
  expect(median).toBeLessThan(BOUND_MS)
})
