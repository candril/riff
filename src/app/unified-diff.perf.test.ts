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
import { createDiffHighlights } from "./diff-highlights"
import { createUnifiedDiff, type UnifiedDiff } from "./unified-diff"

const files = BIG_FILES
const mapping = BIG_MAPPING

let setup: TestRendererSetup | null = null
let unified: UnifiedDiff | null = null

afterEach(() => {
  unified?.dispose()
  setup?.renderer.destroy()
  unified = null
  setup = null
})

async function mount() {
  setup = await createTestRenderer({ width: 240, height: 50 })
  const state = { ...createInitialState(files, [], "", ""), viewMode: "diff" as const }
  let vimState: VimCursorState = createCursorState()
  const searchState = createSearchState()
  const flashState = createFlashState()
  const diff = createUnifiedDiff({
    renderer: setup.renderer,
    highlights: createDiffHighlights(new FileParses(async () => null), () => {}),
    scrollOff: 5,
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => 0,
  })
  unified = diff
  setup.renderer.root.add(diff.island.host)
  const draw = () =>
    diff.draw({
      mapping,
      state,
      vimState,
      searchState,
      flashState,
      emptyMessage: "No changes to display",
      focused: true,
    })
  draw()
  diff.syncDrawn(true)
  await setup.renderOnce()
  // The host's laid-out size reaches the island a tick after the frame that laid it out.
  await new Promise((resolve) => setTimeout(resolve, 0))
  await setup.renderOnce()

  // The unified calls app.ts makes for a motion: ensureCursorVisible's reveal, then refreshCursor's.
  // Not timed: followCursorInTree (there is no tree here) and the chrome the frame's followers draw.
  const followCursor = () => {
    diff.refreshCursor()
    diff.refreshCursor()
  }
  const handler = new VimMotionHandler({
    getMapping: () => mapping,
    getState: () => vimState,
    setState: (s) => {
      vimState = s
      followCursor()
    },
    getViewportHeight: () => diff.viewportHeight(),
    onCursorMove: followCursor,
  })
  return { setup, handler, draw, mode: () => vimState.mode }
}

test("the fixture is a 10,000-line diff the unified view draws", async () => {
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

// A visual-mode move renders in the app, so each one also hands the unified view a full draw.
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
