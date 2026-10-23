import { test, expect, afterEach } from "bun:test"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { diffFile } from "../diff-rows/fixtures"
import { createInitialState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { FileParses } from "../vim-diff/file-parses"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createSearchState } from "../vim-diff/search-state"
import type { VimCursorState } from "../vim-diff/types"
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

// The margin the app hands split.
const SCROLL_OFF = 5

/** Forty removals paired with forty additions, so each row has a different line on each side. */
const file = diffFile("long.ts", [
  "@@ -1,40 +1,40 @@",
  ...Array.from({ length: 40 }, (_, n) => `-old ${n}`),
  ...Array.from({ length: 40 }, (_, n) => `+new ${n}`),
])

test("the wheel drags the app's cursor onto the line handed over, and its reveal leaves the window where the wheel put it", async () => {
  setup = await createTestRenderer({ width: 160, height: 20 })
  const files = [file]
  const state = { ...createInitialState(files, [], "", ""), viewMode: "diff" as const }
  const mapping = new DiffLineMapping(files, "all")
  let vimState: VimCursorState = createCursorState()
  const diff = createSplitDiff({
    renderer: setup.renderer,
    highlights: createDiffHighlights(new FileParses(async () => null), () => {}),
    scrollOff: SCROLL_OFF,
    getState: () => state,
    diffOptions: { splitView: () => true },
    fileContent: { expanding: () => null },
    chatColumn: { open: () => false },
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => 0,
    onShownChanged: () => {},
  })
  split = diff
  setup.renderer.root.add(diff.island.host)
  diff.syncDrawn(true, 20)
  const draw = () =>
    diff.draw({ mapping, state, vimState, searchState: createSearchState(), flashState: createFlashState(), blameColumns: new Map(), marks: [] })
  draw()
  diff.source().setSide("right")
  await setup.renderOnce()

  // What app.ts's dragCursorTo does with the line: move the cursor there, reveal it and draw.
  const dragged: number[] = []
  diff.island.setOnCursorScrolledAway((line) => {
    dragged.push(line)
    vimState = { ...vimState, line }
    diff.refreshCursor()
    draw()
  })

  for (let tick = 0; tick < 12; tick++) {
    await setup.mockMouse.scroll(10, 3, "down")
    await setup.renderOnce()
  }

  expect(diff.island.scrollTop()).toBe(12)
  const row = diff.source().rows[12 + SCROLL_OFF] as { kind: "pair"; right: number }
  expect(dragged.at(-1)).toBe(row.right)
  expect(vimState.line).toBe(row.right)
  expect(diff.cursorRow()).toBe(12 + SCROLL_OFF)
  expect(diff.source().side).toBe("right")
  diff.refreshCursor()
  expect(diff.island.scrollTop()).toBe(12)
})
