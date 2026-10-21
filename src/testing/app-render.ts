import { createTestRenderer } from "@opentui/core/testing"
import { createFileTreeIsland } from "../app/file-tree"
import { createThreadPanelIsland } from "../app/thread-panel"
import { createChatColumnIsland } from "../app/chat-column"
import { createChatState } from "../features/chat/state"
import { diffCursorPosition, reviewReferences } from "../app/review-chat"
import { fakeAgent } from "../features/chat/fake-agent"
import { createInitialState, type AppState } from "../state"
import { parseDiff } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { FileParses } from "../vim-diff/file-parses"
import { createSearchState } from "../vim-diff/search-state"
import { buildLineMapping } from "../app/init"
import { createFramePass, type FramePassContext } from "../app/frame-pass"
import { createStatusBarIsland } from "../app/status-bar"
import { createFeedIsland } from "../app/feed"
import { createFrameIslands, followFrame, frameIslandHosts } from "../app/overlays"
import { createPrInfoPanelFollower } from "../app/pr-info-panel-follower"
import { createComposerFollower } from "../app/composer-follower"
import { createPromptFollower } from "../app/prompt-follower"
import { writePrompt } from "../app/open-prompt"
import { promptIslandsOf } from "../app/prompt-routing"
import { createFrame } from "../app/frame"
import { createTreeHighlightSync } from "../app/tree-highlight"
import { createAppShell } from "../app/shell"
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
  let searchState = createSearchState()
  const flashState = createFlashState()
  let mapping = buildLineMapping(state)
  const fileTreePanel = createFileTreeIsland(renderer, { width: 35 })
  const parses = new FileParses(async () => null)
  let render = () => {}
  let updateSearchPattern = (_value: string) => {}
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

  const islands = createFrameIslands(renderer, {
    onSummaryChange(value) {
      if (state.reviewPreview.open) state = { ...state, reviewPreview: { ...state.reviewPreview, body: value } }
      render()
    },
  })
  // The fake answers only when a test tells it to, so nothing here ever reaches Claude.
  const agent = fakeAgent()
  const chat = createChatState(
    agent.agent,
    diffCursorPosition({
      getState: () => state,
      getVimState: () => vimState,
      getMapping: () => mapping,
      getScope: () => split.commentScope(),
      getRows: () => split.splitRows(),
    }),
    reviewReferences(() => state),
  )
  const chrome = {
    statusBar: createStatusBarIsland(renderer),
    threadPanel: createThreadPanelIsland(renderer),
    chatColumn: createChatColumnIsland(renderer, chat),
    feed: createFeedIsland(renderer),
  }
  const shell = createAppShell(renderer, {
    ...frameIslandHosts(islands),
    tree: fileTreePanel.host,
    threadPanel: chrome.threadPanel.host,
    chat: chrome.chatColumn.host,
    statusBar: chrome.statusBar.host,
  })
  const frame = createFrame()
  const setState = (updater: (s: AppState) => AppState) => {
    state = updater(state)
  }
  followFrame(
    frame.frame,
    {
      ...islands,
      ...chrome,
      composer: createComposerFollower(chrome.threadPanel.compose, { getState: () => state, setState, render: () => render() }),
      prompt: createPromptFollower(
        promptIslandsOf(islands, chrome.feed, chrome.threadPanel),
        writePrompt({ setState, updateSearchPattern: (value) => updateSearchPattern(value) }, () => render())
      ),
      // The harness mounts no PR info panel.
      prInfoPanel: createPrInfoPanelFollower(() => null),
    },
    shell
  )

  const treeHighlight = createTreeHighlightSync(fileTreePanel)
  const framePassContext: FramePassContext = {
    getState: () => state,
    setState,
    getVimState: () => vimState,
    getLineMapping: () => mapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    getCachedCurrentUser: () => null,
    getPrInfoPanel: () => null,
    renderer,
    shell,
    feed: chrome.feed,
    split,
    unified,
    parses,
    updateFileTreePanel() {
      state = treeHighlight.sync(state, mapping.getLine(vimState.line)?.filename ?? null, (synced) =>
        fileTreePanel.update({
          files: synced.files,
          fileTree: synced.fileTree,
          highlightIndex: synced.treeHighlightIndex,
          selectedFileIndex: synced.selectedFileIndex,
          focused: synced.focusedPanel === "tree",
          fileStatuses: synced.fileStatuses,
          ignoredFiles: synced.ignoredFiles,
          showHiddenFiles: synced.showHiddenFiles,
          treeFilter: synced.treeFilter,
          treeFilterInput: synced.treeFilterInput,
          unviewedOnly: synced.treeUnviewedOnly ? { keep: synced.treeKeptFile } : null,
        })
      )
      fileTreePanel.visible = state.showFilePanel
    },
    publishFrame: frame.publish,
  }
  render = createFramePass(framePassContext)
  // Keys tests reach the composer through the thread panel, and the frame
  // pass's context does not carry it.
  const ctx = { ...framePassContext, threadPanel: chrome.threadPanel }

  return {
    setup,
    ctx,
    /** The islands that follow the frame rather than the render context. */
    islands,
    statusBar: chrome.statusBar,
    chatColumn: chrome.chatColumn,
    /** The one conversation with riff's agent, which outlives the column's opening and closing. */
    chat,
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
    setSearchState(next: typeof searchState) {
      searchState = next
    },
    /** Where what is typed into the search line goes; nowhere until a test wires a handler. */
    onSearchPattern(update: (value: string) => void) {
      updateSearchPattern = update
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
