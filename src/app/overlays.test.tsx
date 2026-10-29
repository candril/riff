import { test, expect, afterEach } from "bun:test"
import { batch } from "solid-js"
import { BoxRenderable, TextRenderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState, type SearchState } from "../vim-diff/search-state"
import { createFlashState, type FlashState } from "../vim-diff/flash-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { X, Y } from "../testing/marks"
import { createFrame, type Frame } from "./frame"
import { createAppShell } from "./shell"
import { FRAME_ISLANDS, SELF_SHOWN, type FrameIslandId } from "./frame-models"
import { createFrameIslands, followFrame, frameIslandHosts } from "./overlays"
import { createThreadPanelIsland } from "./thread-panel"
import { createFeedIsland } from "./feed"
import { createFilePickerState } from "../features/file-picker/state"
import { emptyFeed } from "../features/feed/types"

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
  const panels = { threadPanel: createThreadPanelIsland(renderer), feed: createFeedIsland(renderer) }
  const hidden = () => {
    const box = new BoxRenderable(renderer, {})
    box.visible = false
    return box
  }
  const statusBar = new TextRenderable(renderer, { content: "STATUS BAR", height: 1 })
  const shell = createAppShell(renderer, {
    ...frameIslandHosts(islands),
    tree: hidden(),
    threadPanel: panels.threadPanel.host,
    chat: hidden(),
    statusBar,
  })
  const shown: [FrameIslandId, boolean][] = []
  const { frame, publish } = createFrame()
  const stubs = Object.fromEntries(FRAME_ISLANDS.map((id) => [id, { update() {} }]))
  const followers = { ...stubs, ...islands, ...panels } as unknown as Parameters<typeof followFrame>[1]
  const stop = followFrame(frame, followers, {
    show(id, visible) {
      shown.push([id, visible])
      shell.show(id, visible)
    },
  })
  const initial = createInitialState([X, Y], [], "test", "")
  const pass = (
    { help = false, filePicker = false, ...state }: Partial<AppState> & { help?: boolean; filePicker?: boolean },
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
    diff: { columnInfo: null, selectionInfo: null },
    chatOpen: false,
    chatExpanded: false,
    help: { open: help, scroll: 0 },
    confirmDialog: null,
    syncPreview: null,
    reviewPreview: null,
    pendingReview: null,
    toast: null,
    lastRefreshedAt: "",
    prCommentInput: { open: false, text: "", loading: false, error: null },
    prInfoFilter: { filter: "", filterInput: false },
    filePicker: filePicker ? createFilePickerState().snapshot() : null,
    commentsPicker: null,
    occurrencePicker: null,
    marksPicker: null,
    marks: [],
    feed: emptyFeed(),
    visit: null,
    commitPicker: null,
    actionMenu: null,
    linePeek: null,
    blamePeek: null,
    mentions: { pool: [], searching: null },
    commentDrafts: new Map(),
    composerText: "",
    composerPickers: { mention: null, emoji: null },
    codePeekId: null,
    commandKeys: new Map(),
    actionFocus: { reactionTarget: null },
  })
  return { islands, panels, statusBar, shown, publish, pass, stop, initial }
}

test("a published frame shows its overlays before publish returns, and the next one hides them", async () => {
  const { islands, shown, publish, pass, stop } = await mount(110, 70)
  expect(shown).toEqual([])

  publish(pass({ help: true }))
  const help = () => shown.filter(([id]) => id === "helpOverlay").map(([, visible]) => visible)
  expect(help()).toEqual([true])
  expect(islands.helpOverlay.host.visible).toBe(true)
  expect(await screen()).toContain("Keyboard Shortcuts")

  publish(pass({ help: false }))
  expect(help()).toEqual([true, false])
  expect(await screen()).not.toContain("Keyboard Shortcuts")

  stop()
  publish(pass({ help: true }))
  expect(help()).toEqual([true, false])
  for (const island of Object.values(islands)) island.dispose()
})

test("one frame draws a picker, the search and flash lines in the status bar's stead, and the header", async () => {
  const { islands, statusBar, shown, publish, pass, stop } = await mount(100, 24)

  publish(pass({ filePicker: true }, { search: { pattern: "needle" }, flash: { active: true } }))
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

test("the shell shows every follower but the ones that show themselves", async () => {
  const { islands, panels, shown, publish, pass, stop, initial } = await mount(110, 40)

  publish(pass({ filePicker: true, viewMode: "feed", inlineCommentOverlay: { ...initial.inlineCommentOverlay, open: true } }))
  expect(panels.threadPanel.host.visible).toBe(true)
  const ids = new Set(shown.map(([id]) => id))
  for (const id of SELF_SHOWN) expect(ids.has(id)).toBe(false)
  expect(ids).toEqual(new Set(FRAME_ISLANDS.filter((id) => !SELF_SHOWN.has(id))))
  expect(shown).toContainEqual(["filePicker", true])

  stop()
  for (const island of [...Object.values(islands), ...Object.values(panels)]) island.dispose()
})

test("publishing inside a Solid batch throws, as the islands would draw only after render() returned", async () => {
  const { islands, panels, publish, pass, stop } = await mount(80, 24)

  expect(() => publish(pass({ help: true }))).not.toThrow()
  expect(() => batch(() => publish(pass({ help: false })))).toThrow("render() ran inside a Solid batch")

  stop()
  expect(() => batch(() => publish(pass({})))).not.toThrow()
  for (const island of [...Object.values(islands), ...Object.values(panels)]) island.dispose()
})

test("the first frame published inside a Solid batch throws too", async () => {
  const { islands, panels, publish, pass, stop } = await mount(80, 24)

  expect(() => batch(() => publish(pass({ help: true })))).toThrow("render() ran inside a Solid batch")

  stop()
  for (const island of [...Object.values(islands), ...Object.values(panels)]) island.dispose()
})

test("every frame updates the islands in FRAME_ISLANDS' order, as focus passes down it", () => {
  const { frame, publish } = createFrame()
  const updates: FrameIslandId[] = []
  const recording = Object.fromEntries(FRAME_ISLANDS.map((id) => [id, { update: () => void updates.push(id) }]))
  const stop = followFrame(frame, recording as unknown as Parameters<typeof followFrame>[1], { show() {} })
  const initial = createInitialState([X, Y], [], "test", "")
  for (let pass = 0; pass < 4; pass++) {
    updates.length = 0
    publish({
      state: initial,
      vimState: createCursorState(),
      mapping: new DiffLineMapping([], "all"),
      searchState: createSearchState(),
      flashState: createFlashState(),
      cachedCurrentUser: null,
      width: 120,
      height: 40,
      now: pass,
      diff: { columnInfo: null, selectionInfo: null },
      chatOpen: false,
      chatExpanded: false,
      help: { open: false, scroll: 0 },
      confirmDialog: null,
      syncPreview: null,
      reviewPreview: null,
      pendingReview: null,
      toast: null,
      lastRefreshedAt: "",
      prCommentInput: { open: false, text: "", loading: false, error: null },
      prInfoFilter: { filter: "", filterInput: false },
      filePicker: null,
      commentsPicker: null,
      occurrencePicker: null,
      marksPicker: null,
      marks: [],
      feed: emptyFeed(),
      visit: null,
      commitPicker: null,
      actionMenu: null,
      linePeek: null,
      blamePeek: null,
      mentions: { pool: [], searching: null },
      commentDrafts: new Map(),
      composerText: "",
      composerPickers: { mention: null, emoji: null },
      codePeekId: null,
      commandKeys: new Map(),
      actionFocus: { reactionTarget: null },
    })
    expect(updates).toEqual([...FRAME_ISLANDS])
  }
  stop()
})
