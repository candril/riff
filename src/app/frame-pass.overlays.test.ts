import { test, expect, afterEach } from "bun:test"
import { BoxRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer, type TestRendererSetup } from "@opentui/core/testing"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import { createSearchState } from "../vim-diff/search-state"
import { createFlashState } from "../vim-diff/flash-state"
import { keepAlive } from "../utils/renderables"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { diffFile } from "../diff-rows/fixtures"
import type { Comment } from "../types"
import { createFramePass, type FramePassContext } from "./frame-pass"
import { createFeedIsland } from "./feed"
import { createAppShell, OVERLAYS, type OverlayId, type ShellParts } from "./shell"
import { createFrame } from "./frame"
import { followFrame } from "./overlays"
import { FRAME_ISLANDS } from "./frame-models"
import type { FeedEvent } from "../utils/feed"
import { createHelpState } from "../features/help/state"
import { createConfirmState, type ConfirmDialogState } from "../features/confirm/state"
import { createSyncPreviewState } from "../features/sync-preview/state"
import { createReviewPreviewState } from "../features/review-preview/state"
import { createFilePickerState } from "../features/file-picker/state"

/*
 * Only where the frame pass and its followers put the overlay islands' hosts,
 * and the feed's: every other island is a bare host, and with no files the
 * diff views are never drawn.
 */

let setup: TestRendererSetup | null = null

const mapping = new DiffLineMapping([diffFile("a.ts", ["@@ -1 +1 @@", "+const a = 1"])], "all")

afterEach(() => {
  setup?.renderer.destroy()
  setup = null
})

async function harness(real: (renderer: TestRendererSetup["renderer"]) => Partial<FramePassContext> = () => ({})) {
  setup = await createTestRenderer({ width: 120, height: 40 })
  const renderer = setup.renderer
  const island = (id: string) => ({ host: keepAlive(new BoxRenderable(renderer, { id })), update() {}, prompt() {}, compose() {}, dispose() {} })
  let state = createInitialState([], [], "test", "")
  const help = createHelpState()
  const confirm = createConfirmState()
  const syncPreview = createSyncPreviewState()
  const reviewPreview = createReviewPreviewState()
  const filePicker = createFilePickerState()
  const realParts = real(renderer)
  const islands = {
    ...Object.fromEntries(
      FRAME_ISLANDS.map((name) => [name, island(name)])
    ),
    ...realParts,
  } as unknown as Record<"statusBar" | "header" | "threadPanel" | "searchPrompt" | "flashPrompt" | OverlayId, { host: Renderable }>
  const overlayHosts = {} as ShellParts["overlays"]
  for (const id of OVERLAYS) overlayHosts[id] = islands[id].host
  const shell = createAppShell(renderer, {
    header: islands.header.host,
    tree: new BoxRenderable(renderer, {}),
    threadPanel: islands.threadPanel.host,
    chat: new BoxRenderable(renderer, {}),
    searchPrompt: islands.searchPrompt.host,
    statusBar: islands.statusBar.host,
    flashPrompt: islands.flashPrompt.host,
    overlays: overlayHosts,
  })
  const frame = createFrame()
  followFrame(frame.frame, islands as unknown as Parameters<typeof followFrame>[1], shell)
  const ctx = {
    getState: () => state,
    setState: (updater: (s: AppState) => AppState) => (state = updater(state)),
    getVimState: createCursorState,
    getLineMapping: () => mapping,
    getSearchState: createSearchState,
    getFlashState: createFlashState,
    getCachedCurrentUser: () => null,
    getPrInfoPanel: () => null,
    getCommandKeys: () => new Map(),
    renderer,
    shell,
    updateFileTreePanel() {},
    publishFrame: frame.publish,
    help,
    confirm,
    ...islands,
    split: { shown: () => false, syncDrawn() {}, island: { columnStatus: () => null } },
    unified: { syncDrawn() {}, viewportHeight: () => 0, columnStatus: () => null },
    ...realParts,
    // After the islands, two of which share the factories' names.
    syncPreview,
    reviewPreview,
    filePicker,
  } as unknown as FramePassContext
  const render = createFramePass(ctx)
  // Every overlay host stays mounted; what counts as shown is a visible one,
  // in the order the shell stacks them.
  const ids = new Set<string>(OVERLAYS)
  const overlays = () =>
    shell.root.getChildren().flatMap((child: Renderable) => (ids.has(child.id) && child.visible ? [child.id] : []))
  return {
    /**
     * `help`, `confirmDialog`, `syncPreview`, `reviewPreview` and
     * `filePicker` open or close those overlays through their factories; the
     * rest patches the state.
     */
    show({
      help: helpOpen,
      confirmDialog,
      syncPreview: syncPreviewOpen,
      reviewPreview: reviewPreviewOpen,
      filePicker: filePickerOpen,
      ...patch
    }: Partial<AppState> & {
      help?: boolean
      confirmDialog?: ConfirmDialogState | null
      syncPreview?: boolean
      reviewPreview?: boolean
      filePicker?: boolean
    }) {
      state = { ...state, ...patch }
      if (helpOpen === true && !help.open()) help.toggle()
      if (helpOpen === false) help.close()
      if (confirmDialog) confirm.show(confirmDialog)
      if (confirmDialog === null) confirm.close()
      if (syncPreviewOpen === true) syncPreview.show()
      if (syncPreviewOpen === false) syncPreview.close()
      if (reviewPreviewOpen === true) reviewPreview.show()
      if (reviewPreviewOpen === false) reviewPreview.close()
      if (filePickerOpen === true) filePicker.show()
      if (filePickerOpen === false) filePicker.close()
      render()
      return overlays()
    },
  }
}

const dialog = { title: "Clear?", message: "Gone.", onConfirm() {}, onCancel() {} }

test("help and the confirm dialog are mounted only while shown, the dialog above help", async () => {
  const app = await harness()
  expect(app.show({})).toEqual([])
  expect(app.show({ help: true, confirmDialog: dialog })).toEqual(["helpOverlay", "confirmDialog"])
  expect(app.show({ help: false })).toEqual(["confirmDialog"])
  expect(app.show({ confirmDialog: null, help: true })).toEqual(["helpOverlay"])
})

const hunked: Comment = {
  id: "c1",
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: "Looks fine",
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  diffHunk: "@@ -1 +1 @@\n+const a = 1",
}

test("the peeks sit between help and the confirm dialog, gl's under c's, each mounted only while it has a model", async () => {
  const app = await harness()
  const overlay = (codePeekId: string | null) => ({
    ...createInitialState([], [], "test", "").inlineCommentOverlay,
    open: true,
    codePeekId,
  })
  expect(
    app.show({
      help: true,
      showLinePeek: true,
      viewMode: "diff",
      comments: [hunked],
      inlineCommentOverlay: overlay("c1"),
      confirmDialog: dialog,
    })
  ).toEqual(["helpOverlay", "diffPeek", "hunkPeek", "confirmDialog"])
  expect(app.show({ comments: [{ ...hunked, diffHunk: undefined }] })).toEqual([
    "helpOverlay",
    "diffPeek",
    "confirmDialog",
  ])
  expect(app.show({ showLinePeek: false, comments: [hunked] })).toEqual([
    "helpOverlay",
    "hunkPeek",
    "confirmDialog",
  ])
  expect(app.show({ inlineCommentOverlay: overlay(null) })).toEqual(["helpOverlay", "confirmDialog"])
})

test("each picker is mounted only while it is open, under help and the confirm dialog", async () => {
  const app = await harness()
  const initial = createInitialState([], [], "test", "")
  const open = <K extends "commentsPicker" | "marksPicker" | "occurrencePicker" | "commitPicker">(
    key: K,
    isOpen: boolean
  ) => ({
    [key]: { ...initial[key], open: isOpen },
  })
  expect(app.show({ filePicker: true, help: true, confirmDialog: dialog })).toEqual([
    "filePicker",
    "helpOverlay",
    "confirmDialog",
  ])
  expect(app.show({ filePicker: false, ...open("commentsPicker", true), help: false, confirmDialog: null })).toEqual([
    "commentsPicker",
  ])
  expect(app.show({ ...open("commentsPicker", false), ...open("marksPicker", true) })).toEqual([
    "marksPicker",
  ])
  expect(app.show({ ...open("marksPicker", false), ...open("occurrencePicker", true) })).toEqual([
    "occurrencePicker",
  ])
  expect(app.show({ ...open("occurrencePicker", false), ...open("commitPicker", true), help: true })).toEqual([
    "commitPicker",
    "helpOverlay",
  ])
  expect(app.show({ filePicker: true, ...open("occurrencePicker", true) })).toEqual([
    "filePicker",
    "occurrencePicker",
    "commitPicker",
    "helpOverlay",
  ])
  expect(app.show({ filePicker: false, ...open("occurrencePicker", false), ...open("commitPicker", false), help: false })).toEqual([])
})

test("the command palette is mounted only while it is open, under the pickers", async () => {
  const app = await harness()
  const initial = createInitialState([], [], "test", "")
  expect(app.show({ actionMenu: { ...initial.actionMenu, open: true } })).toEqual(["actionMenu"])
  expect(app.show({ filePicker: true })).toEqual(["actionMenu", "filePicker"])
  expect(app.show({ actionMenu: { ...initial.actionMenu, open: false } })).toEqual(["filePicker"])
  expect(app.show({ filePicker: false })).toEqual([])
})

test("the sync preview is mounted only while it is open, above the palette and the toast and under the pickers", async () => {
  const app = await harness()
  const initial = createInitialState([], [], "test", "")
  const sync = (open: boolean) => ({ syncPreview: open })
  expect(app.show(sync(true))).toEqual(["syncPreview"])
  expect(
    app.show({
      toast: { message: "Saved", type: "info" },
      filePicker: true,
      actionMenu: { ...initial.actionMenu, open: true },
    })
  ).toEqual(["actionMenu", "toast", "syncPreview", "filePicker"])
  expect(app.show(sync(false))).toEqual(["actionMenu", "toast", "filePicker"])
  expect(app.show({ ...sync(true), toast: initial.toast, filePicker: false, actionMenu: initial.actionMenu })).toEqual([
    "syncPreview",
  ])
  expect(app.show(sync(false))).toEqual([])
})

test("the review preview is mounted only while it is open, between the toast and the sync preview and under the pickers", async () => {
  const app = await harness()
  const initial = createInitialState([], [], "test", "")
  const review = (open: boolean) => ({ reviewPreview: open })
  expect(app.show(review(true))).toEqual(["reviewPreview"])
  expect(
    app.show({
      toast: { message: "Saved", type: "info" },
      actionMenu: { ...initial.actionMenu, open: true },
      syncPreview: true,
      filePicker: true,
    })
  ).toEqual(["actionMenu", "toast", "reviewPreview", "syncPreview", "filePicker"])
  expect(app.show(review(false))).toEqual(["actionMenu", "toast", "syncPreview", "filePicker"])
  expect(app.show(review(true))).toEqual(["actionMenu", "toast", "reviewPreview", "syncPreview", "filePicker"])
  expect(
    app.show({
      ...review(false),
      toast: initial.toast,
      actionMenu: initial.actionMenu,
      syncPreview: false,
      filePicker: false,
    })
  ).toEqual([])
})

function findById(root: Renderable, id: string): Renderable | undefined {
  for (const child of root.getChildren()) {
    if (child.id === id) return child
    const found = findById(child, id)
    if (found) return found
  }
  return undefined
}

test("the feed view mounts the feed island's host with its rows, and hides it on leaving", async () => {
  let feed: ReturnType<typeof createFeedIsland> | null = null
  const app = await harness((renderer) => ({ feed: (feed = createFeedIsland(renderer)) }))
  const initial = createInitialState([], [], "test", "")
  const events: FeedEvent[] = [
    { id: "r1", type: "review", at: new Date().toISOString(), actor: "carol", title: "approved" },
    { id: "k1", type: "check", at: new Date().toISOString(), title: "build", trailing: "✓ passed" },
  ]
  const frame = async () => {
    await setup!.renderOnce()
    await setup!.renderOnce()
    return setup!.captureCharFrame()
  }

  app.show({ viewMode: "feed", feed: { ...initial.feed, events } })
  const host = findById(setup!.renderer.root, "feed-view")
  expect(host).toBe(feed!.host)
  const screen = await frame()
  expect(screen).toContain("Feed   2 events · all types")
  expect(screen).toContain("@carol")
  expect(screen).toContain("build")

  app.show({ viewMode: "diff" })
  expect(findById(setup!.renderer.root, "feed-view")).toBeUndefined()
  expect(await frame()).not.toContain("Feed")
  expect(feed!.host.isDestroyed).toBe(false)

  app.show({ viewMode: "feed" })
  expect(findById(setup!.renderer.root, "feed-view")).toBe(feed!.host)
  expect(await frame()).toContain("@carol")
  feed!.dispose()
})
