import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile } from "../diff-rows/fixtures"
import { createInitialState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { VimMotionHandler } from "../vim-diff/motion-handler"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
import { toLineState, toRowState } from "./split-cursor"
import { createDiffHighlights } from "./diff-highlights"
import { createSplitDiff, type SplitDiff } from "./split-diff"

const BOUND_MS = process.env["CI"] ? 48 : 16

// Removals pair with a run of additions as long or longer, so word diff has work and some halves are empty.
function file(i: number) {
  const context = (n: number) => `  const value${n} = compute(input${n}, { scale: ${n}, label: "item-${i}-${n}" })`
  const removed = Array.from({ length: 6 }, (_, n) => `-  total += legacyPrice(items[${n}], rate${i}) * ${n + 1}`)
  const added = Array.from({ length: 6 + (i % 3) }, (_, n) => `+  total += priceOf(items[${n}], rates.get("r${i}")) * ${n + 1}`)
  const before = [0, 1, 2, 3].map((n) => ` ${context(n)}`)
  const after = [4, 5, 6, 7].map((n) => ` ${context(n)}`)
  const header = `@@ -1,${8 + removed.length} +1,${8 + added.length} @@ function file${i}()`
  return diffFile(`src/dir${i % 20}/file${i}.ts`, [header, ...before, ...removed, ...added, ...after])
}

const files = Array.from({ length: 500 }, (_, i) => file(i))
const mapping = new DiffLineMapping(files, "all")

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
  // Not timed: followCursorInTree (there is no tree here) and render.ts's chrome, which M3 replaces.
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

async function medianMove(press: () => void, settle: () => Promise<void>): Promise<number> {
  const timings: number[] = []
  for (let i = 0; i < 200; i++) {
    const start = performance.now()
    press()
    await settle()
    timings.push(performance.now() - start)
  }
  timings.sort((a, b) => a - b)
  return timings[100]!
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
