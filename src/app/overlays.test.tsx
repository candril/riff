import { test, expect, afterEach } from "bun:test"
import { BoxRenderable, TextRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState, openFilePicker, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { X, Y } from "../testing/marks"
import { createFrame, type Frame } from "./frame"
import { createAppShell } from "./shell"
import type { FrameIslandId } from "./frame-models"
import { createFrameIslands, followFrame, frameIslandHosts } from "./overlays"

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function screen() {
  await setup!.renderOnce()
  await setup!.renderOnce()
  return setup!.captureCharFrame()
}

/** Every frame island in a real shell, following one frame; the rest of the layout is stand-ins. */
async function mount(width: number, height: number) {
  setup = await createTestRenderer({ width, height })
  const renderer = setup.renderer
  const islands = createFrameIslands(renderer, { onSummaryChange() {} })
  const hidden = () => {
    const box = new BoxRenderable(renderer, {})
    box.visible = false
    return box
  }
  const statusBar = new TextRenderable(renderer, { content: "STATUS BAR", height: 1 })
  const shell = createAppShell(renderer, {
    ...frameIslandHosts(islands),
    tree: hidden(),
    threadPanel: hidden(),
    chat: hidden(),
    statusBar,
  })
  const shown: [FrameIslandId, boolean][] = []
  const { frame, publish } = createFrame()
  const stop = followFrame(frame, islands, {
    show(id, visible) {
      shown.push([id, visible])
      shell.show(id, visible)
    },
  })
  const initial = createInitialState([X, Y], [], "test", "")
  const pass = (
    state: Partial<AppState>,
    { search = {}, flash = {} }: { search?: Partial<SearchState>; flash?: Partial<FlashState> } = {}
  ): Frame => ({
    state: { ...initial, ...state },
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: { ...createSearchState(), ...search },
    flashState: { ...createFlashState(), ...flash },
    cachedCurrentUser: null,
    width,
    height,
    now: 0,
  })
  return { islands, statusBar, shown, publish, pass, stop, initial }
}

test("a published frame shows its overlays before publish returns, and the next one hides them", async () => {
  const { islands, shown, publish, pass, stop } = await mount(110, 70)
  expect(shown).toEqual([])

  publish(pass({ showHelp: true }))
  const help = () => shown.filter(([id]) => id === "helpOverlay").map(([, visible]) => visible)
  expect(help()).toEqual([true])
  expect(islands.helpOverlay.host.visible).toBe(true)
  expect(await screen()).toContain("Keyboard Shortcuts")

  publish(pass({ showHelp: false }))
  expect(help()).toEqual([true, false])
  expect(await screen()).not.toContain("Keyboard Shortcuts")

  stop()
  publish(pass({ showHelp: true }))
  expect(help()).toEqual([true, false])
  for (const island of Object.values(islands)) island.dispose()
})

test("one frame draws a picker, the search and flash lines in the status bar's stead, and the header", async () => {
  const { islands, statusBar, shown, publish, pass, stop, initial } = await mount(100, 24)

  publish(pass(openFilePicker(initial), { search: { pattern: "needle" }, flash: { active: true } }))
  expect(islands.filePicker.host.visible).toBe(true)
  expect(islands.searchPrompt.host.visible).toBe(true)
  expect(islands.flashPrompt.host.visible).toBe(true)
  expect(statusBar.visible).toBe(false)
  let drawn = await screen()
  expect(drawn).toContain("Find Files")
  expect(drawn).toContain("src/x.ts")
  expect(drawn).toContain("/needle")
  expect(drawn).toContain("type to jump")
  expect(drawn).not.toContain("STATUS BAR")
  expect(drawn.split("\n")[0]).toContain("riff")
  expect(shown.map(([id]) => id)).not.toContain("header")

  publish(pass({}))
  expect(islands.filePicker.host.visible).toBe(false)
  expect(islands.searchPrompt.host.visible).toBe(false)
  expect(islands.flashPrompt.host.visible).toBe(false)
  expect(statusBar.visible).toBe(true)
  drawn = await screen()
  expect(drawn).not.toContain("Find Files")
  expect(drawn).not.toContain("/needle")
  expect(drawn).not.toContain("type to jump")
  expect(drawn).toContain("STATUS BAR")
  expect(drawn.split("\n")[0]).toContain("riff")

  stop()
  for (const island of Object.values(islands)) island.dispose()
})
