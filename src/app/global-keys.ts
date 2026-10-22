/**
 * Global key handling
 *
 * Dispatches the keys the keymap's layers leave (ADR-002) to feature modules.
 * Features are checked in priority order: modal overlays first, then global
 * shortcuts, then panel-specific handlers.
 */

import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import type { ComposerHandle } from "./island-composer"
import type { AppState } from "../state"
import { clearTreeFilter, expandFiles, focusLeft, focusRight } from "../state"
import { expandThreadFor, getInlineCommentOverlayComments, visibleFeedRows, openActionMenu, toggleHelp, toggleLinePeek, togglePeekSide, scrollPeek, toggleWrapLines, openFilePicker, openCommitPicker, setViewFilter, commitViewFilter, clearViewFilter, openInlineCommentOverlay, closeInlineCommentOverlay, toggleFilePanel, toggleFilePanelExpanded, switchView, setViewingCommit, showToast, clearToast } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState, FlashSurface } from "../vim-diff/flash-state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { SearchHandler } from "../vim-diff/search-handler"
import type { FlashHandler } from "../vim-diff/flash-handler"
import { exitVisualMode, isVisualMode } from "../vim-diff/cursor-state"
import type { CommentScope } from "../diff-rows/comment-scope"
import { blockAnchor } from "../features/comments/block-anchor"
import type { DiffViewport } from "./diff-viewport"
import { togglesSplit } from "./split-toggle-key"
import type { ChatState } from "../features/chat/state"
import type { PRInfoPanelClass } from "../components"
import type { FileTreeIsland } from "./file-tree"
import type { ThreadPanelLayout } from "../features/inline-comment-overlay/motions"
import { createCursorState } from "../vim-diff/cursor-state"
import { treeRowsOf } from "../components"
import { visibleOverlayCommentIds } from "../components/thread-panel-window"
import { feedRowsInView } from "../components/feed-window"
import { createOpenLink } from "./open-link"
import { feedExpandDeps } from "./feed-key-deps"
import { createLinksPicker } from "./links-picker"

import * as commentsPicker from "../features/comments-picker"
import * as occurrencePicker from "../features/occurrence-picker"
import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as search from "../features/search"
import * as feed from "../features/feed"
import * as fileTreeFeature from "../features/file-tree"
import * as diffView from "../features/diff-view"
import * as folds from "../features/folds"
import * as fileNavigation from "../features/file-navigation"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as followLink from "../features/follow-link"
import * as prOperations from "../features/pr-operations"
import * as threadMotion from "../features/thread-motion"
import * as jumplist from "../features/jumplist"
import * as marks from "../features/marks"
import { createBlameKeys, type BlameDeps } from "../features/blame/keys"
import { createBlameColumnKeys } from "../features/blame/column-keys"
import { chordAllowedUnderPeek } from "../features/blame/peek-chords"
import type { Comment, ReactionTarget } from "../types"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"

export interface GlobalKeyContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  getCommentScope: () => CommentScope
  rebuildLineMapping: () => void
  // Search state
  getSearchState: () => SearchState
  // Flash jump state (spec 022)
  getFlashState: () => FlashState
  // UI
  renderer: { height: number }
  cursorView: DiffViewport
  fileTreePanel: FileTreeIsland
  threadPanelLayout: () => ThreadPanelLayout | null
  getPrInfoPanel: () => PRInfoPanelClass | null
  // Vim handlers
  vimHandler: VimMotionHandler
  searchHandler: SearchHandler
  flashHandler: FlashHandler
  // Helpers
  render: () => void
  quit: () => void
  ensureCursorVisible: () => void
  /** `\`: side by side where it fits, unified otherwise. */
  toggleSplitView: () => void
  updateFileTreePanel: () => void
  handleExpandDivider: () => Promise<boolean>
  handleYank: (options: { raw: boolean }) => void
  handleCopyCommentLink: (comment?: Comment | null) => Promise<void>
  executeAction: (id: string) => void
  /** `H` in the thread panel: open threads only, saved with the review. */
  toggleOpenThreadsOnly: () => void
  /** `H` in the file tree: unviewed files only, saved with the review. */
  toggleUnviewedFilesOnly: () => void
  /** Toggle a reaction on a target — fired when the user presses Enter
   *  on a React… submenu row (spec 042). */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  // Commit selection handler
  /** Scope the diff to a commit — and, when named, scroll to one of its files. */
  onCommitSelected: (sha: string | null, filename?: string, scope?: readonly string[] | null) => void
  /** Load the pull request the branch already has and read it as one
   *  (spec 095). Only meaningful in local mode with a `branchPr`. */
  openBranchPr: (view: "state" | "feed") => void
  // Feature contexts (passed through for delegation)
  foldsContext: folds.FoldsContext
  fileNavContext: fileNavigation.FileNavigationContext
  commentsContext: commentsFeature.CommentsContext
  externalToolsContext: externalTools.ExternalToolsContext
  prOperationsContext: prOperations.PrOperationsContext
  refreshContext: { handleRefresh: () => Promise<void> }
  /** Loading the feed's own data (spec 070). */
  feedLoadContext: feed.FeedLoadContext
  reviewPreviewOpenContext: reviewPreview.ReviewPreviewOpenContext
  /** Read from the textarea, not `state.reviewPreview.body`: that mirror
   *  is updated asynchronously and can lag the last keystroke. */
  readReviewSummary: () => string
  /** The comment composer's textarea, which the overlay's keys read and fill. */
  composer: ComposerHandle
  syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext
  prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext
  threadMotionContext: threadMotion.ThreadMotionContext
  marksContext: marks.MarksContext
  /** `gb`'s blame source and the browser and clipboard its peek hands off to (spec 103). */
  blame: BlameDeps
  /** The chat column's conversation and its input (spec 102). */
  chat: { state: ChatState; input: () => TextareaRenderable | null }
  /** How the thread panel's composer closed, for a proposal of the agent's that is open in it. */
  composerSettled?: (outcome: ComposerOutcome) => void
}

/**
 * Get the current file path based on context (like nvim's Ctrl+g).
 * Returns the full path from:
 * - File tree: highlighted file path
 * - Single file view: selected file path
 * - All files view: file at cursor position
 */
/**
 * Which list `s` labels, or null when the diff has the cursor and its own
 * search-then-label flavour applies (spec 066).
 */
function flashSurface(state: AppState): FlashSurface | null {
  // The comments panel is checked first: it is an overlay, so it has focus
  // over whichever view is behind it.
  if (state.focusedPanel === "comments" && state.inlineCommentOverlay.mode === "view") {
    return "comments"
  }
  if (state.viewMode === "state") return "state"
  if (state.viewMode === "feed") return "feed"
  if (state.focusedPanel === "tree") return "tree"
  return null
}

function flashTargets(state: AppState, ctx: GlobalKeyContext): string[] {
  switch (flashSurface(state)) {
    case "tree": {
      const count = treeRowsOf(state).length
      const { first, last } = ctx.fileTreePanel.visibleRows()
      const ids: string[] = []
      for (let index = first; index <= Math.min(last, count - 1); index++) ids.push(String(index))
      return ids
    }
    case "state":
      return ctx.getPrInfoPanel()?.flashTargets() ?? []
    case "feed":
      return feedRowsInView(visibleFeedRows(state), state.feed, ctx.renderer.height).map(String)
    case "comments":
      return visibleOverlayCommentIds(
        getInlineCommentOverlayComments(state),
        state.inlineCommentOverlay.expandedThreadIds,
        state.inlineCommentOverlay.highlightedIndex,
        state.inlineCommentOverlay.expanded
      )
    default:
      return []
  }
}

/**
 * Keys the surface acts on, kept out of the label alphabet so a mistyped
 * jump cancels rather than marking a file viewed or resolving a thread.
 */
function reservedKeysFor(surface: FlashSurface): string {
  switch (surface) {
    case "tree":
      return "vx"
    case "state":
      return "xc"
    case "comments":
      // Reply, edit, delete and resolve: the keys whose mistake costs the
      // most are the ones flash refuses to be confused with.
      return "redx"
    default:
      return ""
  }
}

function getCurrentFilePath(ctx: GlobalKeyContext): string | null {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const vimState = ctx.getVimState()

  if (state.focusedPanel === "tree") {
    // From file tree - use highlighted item
    const flatItems = treeRowsOf(state)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (highlightedItem) {
      return highlightedItem.node.path
    }
  } else if (state.selectedFileIndex !== null) {
    // Single file view - use selected file
    const file = state.files[state.selectedFileIndex]
    if (file) {
      return file.filename
    }
  } else {
    // All files view - use file at cursor
    const currentLine = lineMapping.getLine(vimState.line)
    if (currentLine?.filename) {
      return currentLine.filename
    }
  }

  return null
}

/**
 * `chordPending` is exposed because the jump recorder judges a chord as one
 * interaction: a place reached by its second key is recorded from where the
 * first key was pressed. `clearChord` and `settleChord` are for the keymap
 * layers that take keys ahead of the chain yet must still cancel its chord,
 * as the chain's own branches did.
 */
export type GlobalKeyHandler = ((key: KeyEvent) => void) & {
  chordPending(): boolean
  clearChord(): void
  /** Whether a chord is still pending once `key` settles it, without settling it. */
  chordPendingAfter(key: KeyEvent): boolean
  /** Drops a pending mark chord that `key` gives way to. */
  settleChord(key: KeyEvent): void
}

export function createKeyHandler(ctx: GlobalKeyContext): GlobalKeyHandler {
  const openLink = createOpenLink(ctx)
  const { linksTitle, openLinksPicker } = createLinksPicker(ctx)

  /**
   * Scroll the diff sideways and bring the cursor with it. Leaving the
   * cursor behind would hide it the moment it left the window, which is
   * how vim behaves too.
   */
  function scrollColumns(delta: number): void {
    ctx.cursorView.scrollColumnsBy(delta)
    const vimState = ctx.getVimState()
    const col = ctx.cursorView.clampColumnToWindow(vimState.line, vimState.col)
    if (col !== vimState.col) {
      ctx.setVimState({ ...vimState, col, desiredCol: null })
    }
    ctx.render()
  }

  const blameContext = {
    deps: ctx.blame,
    getState: ctx.getState,
    setState: ctx.setState,
    getLineMapping: ctx.getLineMapping,
    getVimState: ctx.getVimState,
    render: ctx.render,
    toast(message: string, type: "success" | "error" | "info") {
      ctx.setState((s) => showToast(s, message, type))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
    },
  }
  const blame = createBlameKeys(blameContext)
  const blameColumn = createBlameColumnKeys(blameContext)

  // Key sequence tracking
  let pendingKey: string | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function clearPendingKey() {
    pendingKey = null
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  function openChord(opener: string) {
    pendingKey = opener
    const timeout = marks.chordTimeoutMs(opener)
    if (timeout !== null) pendingTimeout = setTimeout(clearPendingKey, timeout)
  }

  /** `fm` finds an m and `vi'` selects quotes: a key some motion is waiting for is not a chord. */
  function diffTakesMarkChord(): boolean {
    const state = ctx.getState()
    const vim = ctx.getVimState()
    return (
      state.viewMode === "diff" &&
      state.focusedPanel === "diff" &&
      vim.mode === "normal" &&
      vim.pendingFindChar === null &&
      vim.pendingTextObject === null
    )
  }

  const followLinkContext: followLink.FollowLinkContext = {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    getLineMapping: ctx.getLineMapping,
    render: ctx.render,
    jumpToFile: (candidates, line) => {
      const state = ctx.getState()
      const filename = candidates.find((candidate) =>
        state.files.some((file) => file.filename === candidate)
      )
      if (!filename) return false
      const fileIndex = state.files.findIndex((file) => file.filename === filename)

      // A file marked viewed is folded shut; a link to it means to read it.
      if (state.collapsedFiles.has(filename)) {
        ctx.setState((s) => expandFiles(s, [filename]))
        ctx.rebuildLineMapping()
      }
      fileNavigation.revealFile(fileIndex, ctx.fileNavContext)

      if (line !== undefined) {
        const visualLine = ctx.getLineMapping().findVisualLineForFileLine(filename, line)
        if (visualLine !== null) {
          ctx.setVimState({ ...ctx.getVimState(), line: visualLine, col: 0, desiredCol: null })
          ctx.ensureCursorVisible()
        }
      }

      ctx.render()
      return true
    },
    openPath: (candidates, line, tmux) => {
      void (async () => {
        // The reading that exists on disk wins; with neither there, the first
        // is the one the fetch-from-GitHub fallback should ask for.
        let target = candidates[0]!
        for (const candidate of candidates) {
          if (await Bun.file(candidate).exists()) {
            target = candidate
            break
          }
        }

        if (tmux) {
          await externalTools.handleOpenPathInTmuxWindow(ctx.externalToolsContext, target, line)
          return
        }
        await externalTools.handleOpenFileAtLine(ctx.externalToolsContext, target, line ?? 0)
      })()
    },
    openUrl: (url) => {
      const opener =
        process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" })
    },
    copyUrl: (url) => openLink("copy", { label: "link", url }),
  }

  const jumpApplyCtx: jumplist.JumpApplyContext = {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    setVimState: ctx.setVimState,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }

  /**
   * The comments panel, opened on whatever the diff cursor is pointing at.
   * Both live here rather than in the diff's own key handling because
   * `Ctrl-t` reaches them from every view (spec 064).
   */
  function openCommentsOverlay(mode: "view" | "compose" | "edit"): boolean {
    // spec 039: Enter opens the overlay in view mode if there's an
    // existing thread on this anchor; `c` opens it in compose mode
    // on any commentable line. Returns true when the overlay was
    // opened so the caller can fall back (e.g. Enter → expand
    // divider) when this is a no-op.
    const s = ctx.getState()
    const lineMapping = ctx.getLineMapping()
    const vimState = ctx.getVimState()
    // A visual-line selection anchors on the first commentable line
    // it covers — the same rule `handleAddComment` uses for `C`, so
    // both routes land the comment in the same place.
    const block = blockAnchor(lineMapping, ctx.getCommentScope())
    // A line GitHub cannot take is still a line, and what gets written on it
    // is a note (spec 085).
    if (!block) return false
    const { anchor, blockStart, anchorHash } = block

    const root = s.comments.find(
      (c) =>
        c.filename === anchor.filename &&
        c.line === anchor.line &&
        c.side === anchor.side &&
        !c.inReplyTo
    )
    if (mode === "view" && !root) return false

    // The selection has served its purpose; leave visual mode so the
    // highlight doesn't linger behind the composer.
    if (isVisualMode(vimState)) {
      ctx.setVimState(exitVisualMode(vimState))
    }

    ctx.setState((st) => {
      const opened = openInlineCommentOverlay(
        st, anchor.filename, anchor.line, anchor.side, mode, blockStart, undefined,
        { note: anchor.note, anchorHash }
      )
      // Asked for this thread by name: a resolved one opens rather than
      // showing its root and hiding the rest.
      return mode === "view" && root ? expandThreadFor(opened, root.id) : opened
    })
    ctx.render()
    return true
  }

  function openCommentsPanelForCursor(): void {
    // Open in view mode without an anchor — use the cursor's file
    // (or the currently selected file) so the panel scopes
    // correctly. Anchor line is 0; compose actions inside the
    // panel will re-anchor to the highlighted thread.
    const s = ctx.getState()
    const lineMapping = ctx.getLineMapping()
    const vimState = ctx.getVimState()
    const cursorLine = lineMapping.getLine(vimState.line)
    const filename =
      cursorLine?.filename ??
      (s.selectedFileIndex !== null
        ? s.files[s.selectedFileIndex]?.filename ?? ""
        : "")
    ctx.setState((st) =>
      openInlineCommentOverlay(st, filename, 0, "RIGHT", "view")
    )
    ctx.render()
  }

  return Object.assign(handleKeypress, {
    chordPending: () => pendingKey !== null,
    chordPendingAfter: (key: KeyEvent) =>
      pendingKey !== null && !marks.pendingMarkChordGivesWay(pendingKey, key, diffTakesMarkChord()),
    clearChord: clearPendingKey,
    settleChord,
  })

  // A click into the tree between `m` and its letter leaves the chord
  // pending; the next key was typed for the tree, and every handler below
  // stands aside while a chord is pending.
  function settleChord(key: KeyEvent) {
    if (marks.pendingMarkChordGivesWay(pendingKey, key, diffTakesMarkChord())) clearPendingKey()
  }

  function handleKeypress(key: KeyEvent) {
    settleChord(key)

    // ========== SEARCH INPUT (captures input when search prompt is active) ==========
    if (search.handleInput(key, { searchState: ctx.getSearchState(), searchHandler: ctx.searchHandler })) {
      return
    }

    // ========== TEXT OBJECT (i/a waiting for its object key, spec 055) ==========
    // Ahead of every single-key handler: `vif`'s `f` would otherwise open the
    // file picker and `vi{`'s `{` would reach nobody at all.
    if (ctx.getVimState().pendingTextObject && ctx.getState().focusedPanel === "diff") {
      ctx.vimHandler.handleKey({
        name: key.name,
        sequence: key.sequence,
        ctrl: key.ctrl,
        shift: key.shift,
      })
      ctx.render()
      return
    }


    const dispatchToTree = (): boolean =>
      fileTreeFeature.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: () => ctx.fileTreePanel,
        updatePanel: ctx.updateFileTreePanel,
        onFileSelected: () => {
          ctx.setVimState(createCursorState())
          ctx.rebuildLineMapping()
        },
        revealFile: (fileIndex: number) =>
          fileNavigation.revealFile(fileIndex, ctx.fileNavContext),
        toggleViewedForFile: (filename: string) =>
          fileNavigation.toggleViewedForFile(filename, ctx.fileNavContext),
        toggleUnviewedOnly: ctx.toggleUnviewedFilesOnly,
      })

    // ========== FILE TREE FILTER PROMPT (captures input while open) ==========
    // Before the global single-key handlers, or typing a path would toggle
    // the PR view on `i` and quit on `q`.
    if (ctx.getState().treeFilterInput && dispatchToTree()) {
      return
    }

    // ========== BLAME PEEK (modal: gb toggles it, Esc or q closes) ==========
    if (ctx.getState().blamePeek && ctx.getState().viewMode === "diff" && !pendingKey && blame.handleKey(key)) {
      return
    }

    // ========== PEEK (modal: gl toggles it, Esc or q closes) ==========
    if (ctx.getState().showLinePeek && !pendingKey) {
      if (key.name === "escape" || key.name === "q") {
        ctx.setState(toggleLinePeek)
        ctx.render()
        return
      }
      // Tab swaps a drawn diagram between the version the change arrives at
      // and the one it replaces (spec 058).
      if (key.name === "tab") {
        ctx.setState(togglePeekSide)
        ctx.render()
        return
      }
      // A drawing bigger than the window scrolls under the same keys the
      // diff does; half a page on Ctrl-d / Ctrl-u.
      const half = Math.max(1, Math.floor((process.stdout.rows ?? 40) / 2))
      const step: Record<string, [number, number]> = {
        j: [1, 0], down: [1, 0], k: [-1, 0], up: [-1, 0],
        l: [0, 4], right: [0, 4], h: [0, -4], left: [0, -4],
      }
      const move = key.ctrl && key.name === "d" ? [half, 0]
        : key.ctrl && key.name === "u" ? [-half, 0]
        : !key.ctrl && step[key.name] ? step[key.name] : null
      if (move) {
        ctx.setState((s) => scrollPeek(s, move[0]!, move[1]!))
        ctx.render()
        return
      }
      // `g` still has to reach the chord matcher, or `gl` couldn't close it.
      if (!(key.name === "g" && !key.ctrl && !key.shift)) {
        return
      }
    }

    // ========== GLOBAL KEYS (work in any mode) ==========
    // When a chord is mid-sequence (e.g. user typed `g` and we're
    // waiting for the second key), single-key handlers must NOT fire on
    // the second key — they'd steal it from the chord matcher below.
    // This is what previously broke `gC` (Shift+C → "add-pr-comment"),
    // `gi` (bare `i` → toggleViewMode), etc.
    const state = ctx.getState()
    if (!pendingKey) switch (key.name) {
      case "o":
        if (key.ctrl) {
          // Ctrl-O: back in jumplist (spec 038).
          const result = jumplist.back(ctx.getState(), ctx.getVimState())
          if (result) {
            ctx.setState(() => result.state)
            jumplist.apply(result.jump, jumpApplyCtx)
          }
          return
        }
        break

      case "p":
        if (key.ctrl) {
          // The prompt takes focus in this same keypress; without this the
          // key that opened it is typed into it.
          key.preventDefault()
          ctx.setState(openActionMenu)
          ctx.render()
          return
        }
        break

      case "f":
        // Ctrl-f is the quick jump to a file, from every view. Narrowing
        // what is on screen is `/`, wherever there is a list to narrow.
        if (key.ctrl && state.files.length > 0) {
          key.preventDefault()
          ctx.setState(openFilePicker)
          ctx.render()
          return
        }
        break

      case "k":
        // From every view, and with no mark set too: the empty list says how to set one.
        if (key.ctrl) {
          key.preventDefault()
          ctx.setState(marks.openMarksPicker)
          ctx.render()
          return
        }
        break

      case "g":
      case "G":
        // Ctrl-g is the commit picker — `g` is riff's letter for commits
        // (`]g`, `[g`), and the picker was two keystrokes and a search away
        // in the palette. The file-path toast it used to show is still there
        // as Show File Path.
        if (key.ctrl && key.name === "g") {
          if (state.commits.length > 0) {
            key.preventDefault()
            ctx.setState(openCommitPicker)
            ctx.render()
          }
          return
        }
        // The diff's own G is its motion handler's; the tree's is here. A
        // terminal reports it as a shifted `g` or as `G`.
        if ((key.name === "G" || key.shift) && state.focusedPanel === "tree") {
          folds.handleGoToBottom(ctx.foldsContext)
          return
        }
        break

      case "q":
        ctx.quit()
        return

      case "c":
        // C (shift+c): Add an inline comment via $EDITOR. Falls back
        // silently if the cursor isn't on a commentable line. PR-level
        // conversation comments are command-palette only.
        if (key.shift) {
          void commentsFeature.handleAddComment(ctx.commentsContext)
          return
        }
        break

      case "escape":
        // Clear toast if visible
        if (state.toast.message) {
          ctx.setState(clearToast)
          ctx.render()
          return
        }
        break

      case "i":
      case "a":
      case "d": {
        // The three surfaces are one key apart, from any of them, and the
        // key of the view you are in takes you back where you came from
        // (spec 064). Ctrl-I arrives as `tab` and means jumplist-forward,
        // and inside a selection `i`/`a` open a text object (spec 055), so
        // both are left to their owners.
        if (key.ctrl || key.shift) break
        if (state.focusedPanel === "diff" && isVisualMode(ctx.getVimState())) break

        const target = key.name === "i" ? "state" : key.name === "a" ? "feed" : "diff"
        const switched = switchView(state, target)
        if (switched === state) {
          // The overview and the feed are the pull request's, and a local
          // review on a branch that has one is a keypress away from being
          // able to show them. riff already named it in the header; asking
          // for it is what fetches it (spec 095).
          if (target !== "diff" && state.appMode === "local" && state.branchPr) {
            ctx.openBranchPr(target)
            return
          }
          break
        }
        ctx.setState(() => switched)
        ctx.render()
        // The feed's timeline is fetched the first time it is asked for: a
        // PR nobody opens the feed on costs nothing (spec 070).
        if (switched.viewMode === "feed" && switched.feed.events.length === 0 && !switched.feed.loading) {
          void feed.loadFeed(ctx.feedLoadContext)
        }
        return
      }

      case "s":
        // Ctrl-s greps the change set (spec 088). The composer keeps its own
        // Ctrl-s: its input handles the key before this switch sees it.
        if (key.ctrl) {
          if (state.files.length > 0) {
            key.preventDefault()
            const vim = ctx.getVimState()
            const seed =
              state.viewMode === "diff" && state.focusedPanel === "diff"
                ? occurrencePicker.seedQuery(vim, ctx.getLineMapping())
                : ""
            if (isVisualMode(vim)) ctx.setVimState(exitVisualMode(vim))
            ctx.setState((s) => occurrencePicker.openOccurrencePicker(s, seed))
            ctx.render()
          }
          return
        }
        // `s` labels the rows of whatever list has focus and the next key
        // jumps (spec 066). The diff keeps its own flavour — type first,
        // then pick — and is handled where the diff's keys are.
        if (!key.ctrl && !key.shift && !isVisualMode(ctx.getVimState())) {
          const surface = flashSurface(state)
          if (surface) {
            key.preventDefault()
            ctx.flashHandler.startList(surface, flashTargets(state, ctx), reservedKeysFor(surface))
            ctx.render()
            return
          }
        }
        break

      case "t":
        // Ctrl-t opens the comments panel on what the diff cursor is
        // pointing at, from every view. Closing it is the panel's own
        // binding, so this only ever opens.
        if (key.ctrl && !key.shift) {
          if (!openCommentsOverlay("view")) openCommentsPanelForCursor()
          return
        }
        break

      case "b":
        if (key.ctrl) {
          ctx.setState((s) => {
            const toggled = toggleFilePanel(s)
            if (toggled.showFilePanel) return { ...toggled, focusedPanel: "tree" }
            // A hidden tree must not keep focus: keys would keep going to a
            // panel nobody can see, and typing into the void reaches `q`.
            return s.focusedPanel === "tree" ? { ...toggled, focusedPanel: "diff" } : toggled
          })
          ctx.render()
          setTimeout(() => {
            ctx.render()
          }, 0)
          return
        }
        break

      case "e":
        if (key.ctrl && state.showFilePanel) {
          ctx.setState(toggleFilePanelExpanded)
          ctx.render()
          return
        }
        // E (shift+e): Edit the comment thread on the current line via
        // $EDITOR. Same flow as `C` — handleAddComment shows the thread
        // for editing and includes a reply box. No-op when the cursor
        // isn't on a commented/commentable line.
        if (key.shift) {
          void commentsFeature.handleAddComment(ctx.commentsContext)
          return
        }
        break

      case "tab": {
        // Tab and Ctrl-I are indistinguishable in terminal input; both
        // mean forward-jump in the jumplist (spec 038). The previous
        // view-toggle binding moved to bare `i`.
        const result = jumplist.forward(ctx.getState())
        if (result) {
          ctx.setState(() => result.state)
          jumplist.apply(result.jump, jumpApplyCtx)
        }
        return
      }

      case "backspace":
        // Ctrl-h moves focus one panel left: comments → diff → tree.
        // Terminals deliver bare Ctrl-h as backspace, so this key is both
        // things at once — and walking back to the tree has to come first,
        // or returning to look at what the filter left would drop it.
        if (state.mode === "normal" && focusLeft(state) !== state) {
          ctx.setState(focusLeft)
          ctx.render()
          return
        }
        // Nowhere left to move: a tree filter is the next thing backspace
        // takes down — it is the state most easily forgotten about, and it
        // silently hides files from everything that reads the tree.
        if (state.treeFilter && !state.treeFilterInput) {
          ctx.setState(clearTreeFilter)
          ctx.updateFileTreePanel()
          ctx.render()
          return
        }
        break

      case "l":
        if (key.ctrl) {
          // Ctrl-l moves focus one panel right: tree → diff → comments → chat.
          ctx.setState(focusRight)
          ctx.render()
          setTimeout(() => {
            ctx.render()
          }, 0)
          return
        }
        break
    }

    // ========== KEY SEQUENCES (]f, [f, gS, etc.) ==========
    const chordPending = pendingKey !== null
    if (pendingKey === "m" || pendingKey === "'") {
      const action = marks.markChordAction(pendingKey, key, diffTakesMarkChord())
      clearPendingKey()
      if (action.kind === "set") marks.setMarkAtCursor(action.letter, ctx.marksContext)
      else if (action.kind === "jump") marks.jumpToMark(action.letter, ctx.marksContext)
      else if (action.kind === "flip") marks.flipMark(ctx.marksContext)
      return
    }
    if (pendingKey) {
      const keyChar = key.name || (key.sequence?.length === 1 ? key.sequence : "")
      const sequence = `${pendingKey}${keyChar}${key.shift ? "!" : ""}`
      clearPendingKey()

      const s = ctx.getState()
      if (!chordAllowedUnderPeek(sequence, s)) return

      if (sequence === "]f") {
        if (s.selectedFileIndex === null) {
          // All-files view: move cursor to next file header
          ctx.vimHandler.moveToFile("next")
          ctx.render()
        } else {
          // Single-file view: navigate to next file
          fileNavigation.navigateFileSelection(1, ctx.fileNavContext)
        }
        return
      } else if (sequence === "[f") {
        if (s.selectedFileIndex === null) {
          // All-files view: move cursor to previous file header
          ctx.vimHandler.moveToFile("prev")
          ctx.render()
        } else {
          // Single-file view: navigate to previous file
          fileNavigation.navigateFileSelection(-1, ctx.fileNavContext)
        }
        return
      } else if (sequence === "]u") {
        fileNavigation.navigateToUnviewedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[u") {
        fileNavigation.navigateToUnviewedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]o") {
        fileNavigation.navigateToOutdatedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[o") {
        fileNavigation.navigateToOutdatedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]r") {
        threadMotion.navigateToThread(1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "[r") {
        threadMotion.navigateToThread(-1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "]n") {
        // The comments that arrived since your last visit, in order (spec 069).
        threadMotion.navigateToThread(1, false, ctx.threadMotionContext, true)
        return
      } else if (sequence === "[n") {
        threadMotion.navigateToThread(-1, false, ctx.threadMotionContext, true)
        return
      } else if (sequence === "]R!") {
        threadMotion.navigateToThread(1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "[R!") {
        threadMotion.navigateToThread(-1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "gS!" || sequence === "gs!") {
        reviewPreview.handleOpenReviewPreview(ctx.reviewPreviewOpenContext)
        return
      } else if (sequence === "gs") {
        syncPreview.handleOpenSyncPreview(ctx.syncPreviewOpenContext)
        return
      } else if (sequence === "go") {
        if (s.viewMode === "diff" && blame.openLink()) return
        if (s.appMode === "pr" && s.prInfo) {
          const { owner, repo, number: prNumber } = s.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      } else if (sequence === "gi") {
        if (s.appMode === "pr" && s.prInfo) {
          prInfoPanelFeature.handleOpenPRInfoPanel(ctx.prInfoPanelOpenContext)
        }
        return
      } else if (sequence === "gy") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("copy-pr-url")
        }
        return
      } else if (sequence === "gB!" || sequence === "gb!") {
        ctx.executeAction("open-in-board")
        return
      } else if (sequence === "gY!" || sequence === "gy!") {
        // Copy a GitHub permalink for the selection / current line / file.
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        ctx.executeAction("copy-permalink")
        return
      } else if (sequence === "gf") {
        followLink.handleFollowLink(followLinkContext)
        return
      } else if (sequence === "gF!" || sequence === "gf!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        followLink.handleFollowLink(followLinkContext, { tmux: true })
        return
      } else if (sequence === "gx") {
        followLink.handleFollowLink(followLinkContext, { urlsOnly: true })
        return
      } else if (sequence === "gX!" || sequence === "gx!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        followLink.handleFollowLink(followLinkContext, { urlsOnly: true, copy: true })
        return
      } else if (sequence === "ge") {
        externalTools.handleOpenFileInEditor(ctx.externalToolsContext)
        return
      } else if (sequence === "gE!" || sequence === "ge!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        externalTools.handleOpenFileInTmuxWindow(ctx.externalToolsContext)
        return
      } else if (sequence === "gc") {
        externalTools.handleCheckoutAndEdit(ctx.externalToolsContext)
        return
      } else if (sequence === "gC!" || sequence === "gc!") {
        // spec 044: Open comments picker. Silent no-op when nothing to
        // search so the chord doesn't flash an empty modal. Both `gC!`
        // and `gc!` are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        if (s.comments.length > 0) {
          key.preventDefault()
          ctx.setState(commentsPicker.openCommentsPicker)
          ctx.render()
        }
        return
      } else if (sequence === "gd") {
        // Both versions of this file, side by side (spec 075).
        void externalTools.handleDiffFileInEditor(ctx.externalToolsContext)
        return
      } else if (sequence === "gD!" || sequence === "gd!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        void externalTools.handleDiffFileInEditor(ctx.externalToolsContext, { tmux: true })
        return
      } else if (sequence === "gP!" || sequence === "gp!") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("edit-pr")
        } else if (s.appMode === "local") {
          ctx.executeAction("create-pr")
        }
        return
      } else if (sequence === "gb") {
        // Who last changed the cursor's line, and the commit that says why (spec 103).
        if (s.viewMode === "diff") blame.toggle()
        return
      } else if (sequence === "gl") {
        // The whole line, wrapped, for when scrolling through it sideways
        // is more work than reading it is worth.
        ctx.setState(toggleLinePeek)
        ctx.render()
        return
      } else if (sequence === "gr") {
        ctx.refreshContext.handleRefresh()
        return
      } else if (sequence === "gg") {
        folds.handleGoToTop(ctx.foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        folds.handleGoToBottom(ctx.foldsContext)
        return
      } else if (sequence === "za") {
        // In the feed, `za` opens a commit row into the files it touched.
        if (s.viewMode === "feed") {
          feed.toggleExpandedRow(feedExpandDeps(ctx))
          return
        }
        folds.handleToggleFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "zA!" || sequence === "za!") {
        // Every fenced block in this file at once (spec 073).
        folds.handleToggleFileBlocks(ctx.foldsContext)
        return
      } else if (sequence === "zR!" || sequence === "zr!") {
        folds.handleExpandAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zM!" || sequence === "zm!") {
        folds.handleCollapseAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zr") {
        folds.handleExpandAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zm") {
        folds.handleCollapseAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zw") {
        // The mapping is rebuilt because markdown table padding is applied
        // there and is dropped while wrapping. Drawing the new mapping
        // brings the cursor back into view.
        ctx.setState(toggleWrapLines)
        ctx.rebuildLineMapping()
        ctx.render()
        return
      } else if (sequence === "zB!" || sequence === "zb!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        if (s.viewMode === "diff") blameColumn.toggle()
        return
      } else if (sequence === "zl" || sequence === "zh") {
        scrollColumns(sequence === "zl" ? 1 : -1)
        return
      } else if (sequence === "zL!" || sequence === "zl!" || sequence === "zH!" || sequence === "zh!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        const forward = sequence === "zL!" || sequence === "zl!"
        scrollColumns(ctx.cursorView.halfColumnWindow(ctx.getVimState().line) * (forward ? 1 : -1))
        return
      } else if (sequence === "zs" || sequence === "ze") {
        const vimState = ctx.getVimState()
        ctx.cursorView.scrollColumnToEdge(
          vimState.line,
          vimState.col,
          sequence === "zs" ? "start" : "end"
        )
        ctx.render()
        return
      } else if (sequence === "zz" || sequence === "zt" || sequence === "zb") {
        ctx.cursorView.scrollCursorTo(
          ctx.getVimState().line,
          sequence === "zz" ? "center" : sequence === "zt" ? "top" : "bottom"
        )
        ctx.render()
        return
      } else if (sequence === "zo") {
        folds.handleOpenFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "zc") {
        folds.handleCloseFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "g?" || sequence === "g?!") {
        ctx.setState(toggleHelp)
        ctx.render()
        return
      }
      if (sequence === "]g") {
        // Next commit
        if (s.commits.length > 0) {
          if (s.viewingCommit === null) {
            // All → first commit
            ctx.onCommitSelected(s.commits[0]!.sha)
          } else {
            const idx = s.commits.findIndex(c => c.sha === s.viewingCommit)
            if (idx >= s.commits.length - 1) {
              // Last commit → wrap to all
              ctx.onCommitSelected(null)
            } else {
              ctx.onCommitSelected(s.commits[idx + 1]!.sha)
            }
          }
        }
        return
      } else if (sequence === "[g") {
        // Prev commit
        if (s.commits.length > 0) {
          if (s.viewingCommit === null) {
            // All → last commit
            ctx.onCommitSelected(s.commits[s.commits.length - 1]!.sha)
          } else {
            const idx = s.commits.findIndex(c => c.sha === s.viewingCommit)
            if (idx <= 0) {
              // First commit → wrap to all
              ctx.onCommitSelected(null)
            } else {
              ctx.onCommitSelected(s.commits[idx - 1]!.sha)
            }
          }
        }
        return
      }
      if ((sequence === "]m" || sequence === "[m") && diffTakesMarkChord()) {
        marks.stepToMark(sequence === "]m" ? 1 : -1, ctx.marksContext)
        return
      }
      if (sequence === "]c") {
        ctx.vimHandler.moveToHunk("next")
        ctx.render()
        return
      } else if (sequence === "[c") {
        ctx.vimHandler.moveToHunk("prev")
        ctx.render()
        return
      }
      // Other sequences handled by vim handler
    }

    if (togglesSplit(key, ctx.getState().viewMode, ctx.getVimState(), chordPending)) {
      ctx.toggleSplitView()
      return
    }

    const markChord = chordPending ? null : marks.markChordOpenedBy(key, diffTakesMarkChord())
    if (markChord) {
      openChord(markChord)
      return
    }

    if (key.name === "]" || key.name === "[" || (key.name === "g" && !key.shift) || (key.name === "z" && !key.shift)) {
      openChord(key.name)
      return
    }

    // ========== TREE PANEL FOCUSED ==========
    if (dispatchToTree()) {
      return
    }


    // ========== DIFF VIEW FOCUSED ==========
    diffView.handleInput(key, {
      state: ctx.getState(),
      getVimState: ctx.getVimState,
      setVimState: ctx.setVimState,
      vimHandler: ctx.vimHandler,
      cursorView: ctx.cursorView,
      searchState: ctx.getSearchState(),
      searchHandler: ctx.searchHandler,
      flashHandler: ctx.flashHandler,
      getCurrentComment: () => commentsFeature.getCurrentComment(ctx.commentsContext),
      handleAddComment: () => commentsFeature.handleAddComment(ctx.commentsContext),
      handleYank: ctx.handleYank,
      handleExpandDivider: ctx.handleExpandDivider,
      showAllFiles: () => ctx.executeAction("show-all-files"),
      showAllCommits: () => ctx.onCommitSelected(null),
      handleToggleViewed: (advanceToNext: boolean) =>
        fileNavigation.handleToggleViewed(advanceToNext, ctx.fileNavContext),
      handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(ctx.commentsContext),
      handleOpenInlineOverlay: openCommentsOverlay,
      handleOpenPanelView: openCommentsPanelForCursor,
    })
  }
}
