import { test, expect, afterEach } from "bun:test"
import { BoxRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { keepAlive } from "../utils/renderables"
import { createRenderFunction, type RenderContext } from "./render"

/*
 * Only where render.ts puts the overlay islands' hosts: every other island
 * is a bare host, and with no files the diff views are never drawn.
 */

let setup: TestRendererSetup | null = null

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function harness() {
  setup = await createTestRenderer({ width: 120, height: 40 })
  const renderer = setup.renderer
  const island = (id: string) => ({ host: keepAlive(new BoxRenderable(renderer, { id })), update() {}, dispose() {} })
  let state = createInitialState([], [], "test", "")
  const ctx = {
    getState: () => state,
    setState: (updater: (s: AppState) => AppState) => (state = updater(state)),
    getVimState: createCursorState,
    getLineMapping: () => null,
    getSearchState: createSearchState,
    getFlashState: createFlashState,
    getCachedCurrentUser: () => null,
    getPrInfoPanel: () => null,
    renderer,
    updateFileTreePanel() {},
    updateSearchPattern() {},
    ...Object.fromEntries(
      ["statusBar", "header", "searchPrompt", "flashPrompt", "toast", "draftNotification", "confirmDialog", "helpOverlay"].map(
        (name) => [name, island(name)]
      )
    ),
    split: { shown: () => false, syncDrawn() {}, island: { columnStatus: () => null } },
    unified: { syncDrawn() {}, viewportHeight: () => 0, columnStatus: () => null },
  } as unknown as RenderContext
  const render = createRenderFunction(ctx)
  const overlays = () => {
    const root = renderer.root.getChildren().find((child) => !child.id.startsWith("comment-indicator-"))!
    const ids = new Set(["helpOverlay", "confirmDialog", "draftNotification"])
    return root.getChildren().flatMap((child: Renderable) => (ids.has(child.id) ? [child.id] : []))
  }
  return {
    show(patch: Partial<AppState>) {
      state = { ...state, ...patch }
      render()
      return overlays()
    },
  }
}

const dialog = { title: "Clear?", message: "Gone.", onConfirm() {}, onCancel() {} }
const draft = { filename: "a.ts", line: 1, side: "RIGHT", bodyPreview: "x" } as AppState["draftNotification"]

test("help and the confirm dialog are mounted only while shown, both above the draft notice", async () => {
  const app = await harness()
  expect(app.show({ draftNotification: draft })).toEqual(["draftNotification"])
  expect(app.show({ showHelp: true, confirmDialog: dialog })).toEqual(["helpOverlay", "confirmDialog", "draftNotification"])
  expect(app.show({ showHelp: false })).toEqual(["confirmDialog", "draftNotification"])
  expect(app.show({ confirmDialog: null, showHelp: true })).toEqual(["helpOverlay", "draftNotification"])
})
