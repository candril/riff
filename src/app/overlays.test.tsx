import { test, expect, afterEach } from "bun:test"
import { BoxRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { createFrame, type Frame } from "./frame"
import { createFrameOverlays, followFrame, type FrameOverlayId } from "./overlays"

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

test("a published frame shows its overlays before publish returns, and the next one hides them", async () => {
  setup = await createTestRenderer({ width: 110, height: 70 })
  const overlays = createFrameOverlays(setup.renderer, { onSummaryChange() {} })
  // A full-screen parent, as the shell's root is, for the absolute hosts to sit in.
  const parent = new BoxRenderable(setup.renderer, { width: "100%", height: "100%" })
  setup.renderer.root.add(parent)
  for (const overlay of Object.values(overlays)) {
    overlay.host.visible = false
    parent.add(overlay.host)
  }
  const shown: [FrameOverlayId, boolean][] = []
  const { frame, publish } = createFrame()
  const stop = followFrame(frame, overlays, {
    show(id, visible) {
      shown.push([id as FrameOverlayId, visible])
      overlays[id as FrameOverlayId].host.visible = visible
    },
  })
  expect(shown).toEqual([])

  const initial = createInitialState([], [], "test", "")
  const pass = (state: Partial<AppState>): Frame => ({
    state: { ...initial, ...state },
    vimState: createCursorState(),
    mapping: new DiffLineMapping([], "all"),
    searchState: createSearchState(),
    flashState: createFlashState(),
    cachedCurrentUser: null,
    width: 110,
    height: 70,
    now: 0,
  })

  publish(pass({ showHelp: true }))
  const help = () => shown.filter(([id]) => id === "helpOverlay").map(([, visible]) => visible)
  expect(help()).toEqual([true])
  expect(overlays.helpOverlay.host.visible).toBe(true)
  expect(await screen()).toContain("Keyboard Shortcuts")

  publish(pass({ showHelp: false }))
  expect(help()).toEqual([true, false])
  expect(await screen()).not.toContain("Keyboard Shortcuts")

  stop()
  publish(pass({ showHelp: true }))
  expect(help()).toEqual([true, false])
  for (const overlay of Object.values(overlays)) overlay.dispose()
})
