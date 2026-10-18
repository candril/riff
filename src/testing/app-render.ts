import { createTestRenderer } from "@opentui/core/testing"
import { FileTreePanel } from "../components/FileTreePanel"
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
  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })
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
    fileTreePanel,
    statusBar: createStatusBarIsland(renderer),
    header: createHeaderIsland(renderer),
    searchPrompt: createSearchPromptIsland(renderer),
    flashPrompt: createFlashPromptIsland(renderer),
    toast: createToastIsland(renderer),
    draftNotification: createDraftNotificationIsland(renderer),
    confirmDialog: createConfirmDialogIsland(renderer),
    reviewPreview: createReviewPreviewIsland(renderer),
    syncPreview: createSyncPreviewIsland(renderer),
    feed: createFeedIsland(renderer),
    helpOverlay: createHelpOverlayIsland(renderer),
    diffPeek: createPeekIsland(renderer, { id: "diff-peek-island" }),
    hunkPeek: createPeekIsland(renderer, { id: "hunk-peek-island", zIndex: 60 }),
    filePicker: createFilePickerIsland(renderer),
    commentsPicker: createCommentsPickerIsland(renderer),
    marksPicker: createMarksPickerIsland(renderer),
    occurrencePicker: createOccurrencePickerIsland(renderer),
    commitPicker: createCommitPickerIsland(renderer),
    actionMenu: createActionMenuIsland(renderer),
    split,
    unified,
    parses,
    updateFileTreePanel() {
      fileTreePanel.update(
        state.files,
        state.fileTree,
        state.treeHighlightIndex,
        state.selectedFileIndex,
        state.focusedPanel === "tree",
        state.fileStatuses,
        state.collapsedFiles,
        state.ignoredFiles,
        state.showHiddenFiles
      )
      fileTreePanel.visible = state.showFilePanel
    },
    updateSearchPattern() {},
  }
  render = createRenderFunction(ctx)

  return {
    setup,
    ctx,
    render,
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
