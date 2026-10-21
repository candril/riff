import { createTestRenderer } from "@opentui/core/testing"
import { createFileTreeIsland } from "../app/file-tree"
import { createThreadPanelIsland } from "../app/thread-panel"
import { createChatColumnIsland } from "../app/chat-column"
import { createChatState } from "../features/chat/state"
import { fakeAgent } from "../features/chat/fake-agent"
import { createInitialState, type AppState } from "../state"
import { parseDiff } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { FileParses } from "../vim-diff/file-parses"
import { createSearchState } from "../vim-diff/search-state"
import { buildLineMapping } from "../app/init"
import { createRenderFunction, type RenderContext } from "../app/render"
import { createStatusBarIsland } from "../app/status-bar"
import { createHeaderIsland } from "../app/header"
import { createDraftNotificationIsland, createToastIsland } from "../app/notifications"
import { createConfirmDialogIsland } from "../app/confirm-dialog"
import { createSyncPreviewIsland } from "../app/sync-preview"
import { createFeedIsland } from "../app/feed"
import { createReviewPreviewIsland } from "../app/review-preview"
import { createHelpOverlayIsland } from "../app/help-overlay"
import { createPeekIsland } from "../app/peek-island"
import { createFlashPromptIsland, createSearchPromptIsland } from "../app/prompt-line"
import {
  createActionMenuIsland,
  createCommentsPickerIsland,
  createCommitPickerIsland,
  createFilePickerIsland,
  createMarksPickerIsland,
  createOccurrencePickerIsland,
} from "../app/pickers"
import { createAppShell, OVERLAYS, type ShellParts } from "../app/shell"
import { createDiffHighlights } from "../app/diff-highlights"
import { createSplitDiff } from "../app/split-diff"
import { createUnifiedDiff } from "../app/unified-diff"
import { trimFrame } from "./frame"

/** The host's laid-out size reaches the diff a tick after the frame that laid it out. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * riff's whole render pass on a test screen: every island real, wired the
 * way app.ts wires them, with highlighting that never lands so frames stay
 * deterministic.
 */
export async function mountApp(raw: string, { width = 120, height = 24 }: { width?: number; height?: number } = {}) {
  const setup = await createTestRenderer({ width, height })
  const renderer = setup.renderer
  const files = parseDiff(raw)
  let state: AppState = createInitialState(files, buildFileTree(files), "test", "")
  let vimState = createCursorState()
  const searchState = createSearchState()
  const flashState = createFlashState()
  let mapping = buildLineMapping(state)
  const fileTreePanel = createFileTreeIsland(renderer, { width: 35 })
  const parses = new FileParses(async () => null)
  let render = () => {}
  const highlights = createDiffHighlights(parses, () => render(), async () => null)
  const diffDeps = {
    renderer,
    highlights,
    scrollOff: 2,
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => fileTreePanel.getWidth(),
  }
  const split = createSplitDiff({ ...diffDeps, onShownChanged: () => render() })
  const unified = createUnifiedDiff(diffDeps)

  const overlays = {
    actionMenu: createActionMenuIsland(renderer),
    toast: createToastIsland(renderer),
    reviewPreview: createReviewPreviewIsland(renderer, {
      onSummaryChange(value) {
        if (state.reviewPreview.open) state = { ...state, reviewPreview: { ...state.reviewPreview, body: value } }
        render()
      },
    }),
    syncPreview: createSyncPreviewIsland(renderer),
    filePicker: createFilePickerIsland(renderer),
    commentsPicker: createCommentsPickerIsland(renderer),
    marksPicker: createMarksPickerIsland(renderer),
    occurrencePicker: createOccurrencePickerIsland(renderer),
    commitPicker: createCommitPickerIsland(renderer),
    helpOverlay: createHelpOverlayIsland(renderer),
    diffPeek: createPeekIsland(renderer, { id: "diff-peek-island" }),
    hunkPeek: createPeekIsland(renderer, { id: "hunk-peek-island", zIndex: 60 }),
    confirmDialog: createConfirmDialogIsland(renderer),
    draftNotification: createDraftNotificationIsland(renderer),
  }
  const chrome = {
    statusBar: createStatusBarIsland(renderer),
    header: createHeaderIsland(renderer),
    searchPrompt: createSearchPromptIsland(renderer),
    flashPrompt: createFlashPromptIsland(renderer),
    threadPanel: createThreadPanelIsland(renderer),
    chatColumn: createChatColumnIsland(renderer),
  }
  // The fake answers only when a test tells it to, so nothing here ever reaches Claude.
  const agent = fakeAgent()
  const chat = createChatState(agent.agent)
  const overlayHosts = {} as ShellParts["overlays"]
  for (const id of OVERLAYS) overlayHosts[id] = overlays[id].host
  const shell = createAppShell(renderer, {
    header: chrome.header.host,
    tree: fileTreePanel.host,
    threadPanel: chrome.threadPanel.host,
    chat: chrome.chatColumn.host,
    searchPrompt: chrome.searchPrompt.host,
    statusBar: chrome.statusBar.host,
    flashPrompt: chrome.flashPrompt.host,
    overlays: overlayHosts,
  })

  const ctx: RenderContext = {
    getState: () => state,
    setState: (updater) => (state = updater(state)),
    getVimState: () => vimState,
    getLineMapping: () => mapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    getCachedCurrentUser: () => null,
    getPrInfoPanel: () => null,
    renderer,
    shell,
    ...chrome,
    chat,
    ...overlays,
    feed: createFeedIsland(renderer),
    split,
    unified,
    parses,
    updateFileTreePanel() {
      fileTreePanel.update({
        files: state.files,
        fileTree: state.fileTree,
        highlightIndex: state.treeHighlightIndex,
        selectedFileIndex: state.selectedFileIndex,
        focused: state.focusedPanel === "tree",
        fileStatuses: state.fileStatuses,
        ignoredFiles: state.ignoredFiles,
        showHiddenFiles: state.showHiddenFiles,
      })
      fileTreePanel.visible = state.showFilePanel
    },
    updateSearchPattern() {},
  }
  render = createRenderFunction(ctx)

  return {
    setup,
    ctx,
    fileTreePanel,
    render,
    agent,
    /** Applies `patch` and renders, rebuilding the mapping when the files changed. */
    show(patch: Partial<AppState> = {}) {
      state = { ...state, ...patch }
      if (patch.files) mapping = buildLineMapping(state)
      render()
    },
    setVimState(next: typeof vimState) {
      vimState = next
    },
    async frame() {
      await setup.renderOnce()
      await nextTick()
      await setup.renderOnce()
      return trimFrame(setup.captureCharFrame())
    },
    async dispose() {
      await setup.waitForVisualIdle().catch(() => {})
      renderer.destroy()
    },
  }
}
