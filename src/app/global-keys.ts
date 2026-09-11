/**
 * Global key handling
 *
 * Dispatches keyboard events to feature modules. Features are checked in priority order:
 * modal overlays first, then global shortcuts, then panel-specific handlers.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import { reviewCandidates } from "../utils/publishable"
import { clearTreeFilter, expandFiles } from "../state"
import { expandThreadFor, getInlineCommentOverlayComments, visibleFeedRows, openActionMenu, openActionSubmenu, toggleHelp, toggleLinePeek, togglePeekSide, scrollPeek, toggleWrapLines, openFilePicker, openCommitPicker, setViewFilter, commitViewFilter, clearViewFilter, openInlineCommentOverlay, closeInlineCommentOverlay, toggleFilePanel, toggleFilePanelExpanded, switchView, setViewingCommit, showToast, clearToast, getInlineCommentOverlayDisplayOrder } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState, FlashSurface } from "../vim-diff/flash-state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { SearchHandler } from "../vim-diff/search-handler"
import type { FlashHandler } from "../vim-diff/flash-handler"
import { getSelectionRange, exitVisualMode, isVisualMode } from "../vim-diff/cursor-state"
import type { VimDiffView } from "../components"
import type { PRInfoPanelClass } from "../components"
import type { FileTreePanel } from "../components/FileTreePanel"
import { createCursorState } from "../vim-diff/cursor-state"
import { getVisibleFlatTreeItems } from "../components"
import { visibleOverlayCommentIds } from "../components/InlineCommentOverlay"
import { copyToClipboard } from "../utils/clipboard"
import { collectFromSources, type LinkSource } from "../utils/link-targets"
import { referenceRepo, resolvedReferences } from "../features/references"

import * as actionMenu from "../features/action-menu"
import * as filePicker from "../features/file-picker"
import * as commentsPicker from "../features/comments-picker"
import * as commitPicker from "../features/commit-picker"
import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as inlineCommentOverlay from "../features/inline-comment-overlay"
import * as search from "../features/search"
import * as flash from "../features/flash"
import * as feed from "../features/feed"
import * as fileTreeFeature from "../features/file-tree"
import * as diffView from "../features/diff-view"
import * as folds from "../features/folds"
import * as fileNavigation from "../features/file-navigation"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as followLink from "../features/follow-link"
import * as prOperations from "../features/pr-operations"
import * as aiReview from "../features/ai-review"
import * as threadMotion from "../features/thread-motion"
import * as jumplist from "../features/jumplist"
import type { Comment, ReactionTarget } from "../types"
import { groupIntoThreads } from "../utils/threads"
import { openTextInEditor } from "../utils/editor"

export interface GlobalKeyContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  rebuildLineMapping: () => void
  // Search state
  getSearchState: () => SearchState
  // Flash jump state (spec 022)
  getFlashState: () => FlashState
  // UI
  renderer: { console: { toggle: () => void } }
  vimDiffView: VimDiffView
  fileTreePanel: FileTreePanel
  getPrInfoPanel: () => PRInfoPanelClass | null
  // Vim handlers
  vimHandler: VimMotionHandler
  searchHandler: SearchHandler
  flashHandler: FlashHandler
  // Helpers
  render: () => void
  quit: () => void
  ensureCursorVisible: () => void
  updateFileTreePanel: () => void
  handleExpandDivider: () => Promise<boolean>
  handleYank: (options: { raw: boolean }) => void
  handleCopyCommentLink: (comment?: Comment | null) => Promise<void>
  executeAction: (id: string) => void
  /** Toggle a reaction on a target — fired when the user presses Enter
   *  on a React… submenu row (spec 042). */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  // Commit selection handler
  /** Scope the diff to a commit — and, when named, scroll to one of its files. */
  onCommitSelected: (sha: string | null, filename?: string, scope?: readonly string[] | null) => void
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
  syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext
  prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext
  aiReviewContext: aiReview.AiReviewContext
  threadMotionContext: threadMotion.ThreadMotionContext
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
    case "tree":
      return getVisibleFlatTreeItems(
        state.fileTree,
        state.files,
        state.ignoredFiles,
        state.showHiddenFiles,
        state.treeFilter
      ).map((_, index) => String(index))
    case "state":
      return ctx.getPrInfoPanel()?.flashTargets() ?? []
    case "feed":
      return visibleFeedRows(state).map((_, index) => String(index))
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

/** The platform's "open this the way the desktop would" command. */
function openerCommand(): string {
  if (process.platform === "darwin") return "open"
  return process.platform === "win32" ? "start" : "xdg-open"
}

function getCurrentFilePath(ctx: GlobalKeyContext): string | null {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const vimState = ctx.getVimState()

  if (state.focusedPanel === "tree") {
    // From file tree - use highlighted item
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles, state.treeFilter)
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

export function createKeyHandler(ctx: GlobalKeyContext): (key: KeyEvent) => void {
  /**
   * Scroll the diff sideways and bring the cursor with it. Leaving the
   * cursor behind would hide it the moment it left the window, which is
   * how vim behaves too.
   */
  function scrollColumns(delta: number): void {
    ctx.vimDiffView.scrollColumnsBy(delta)
    const vimState = ctx.getVimState()
    const col = ctx.vimDiffView.clampColumnToWindow(vimState.line, vimState.col)
    if (col !== vimState.col) {
      ctx.setVimState({ ...vimState, col, desiredCol: null })
    }
    ctx.render()
  }

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

  // Snapshot the current location into the jumplist. Call BEFORE a
  // navigation mutates state — the entry is the location we'll jump back
  // to with Ctrl-O (spec 038).
  function recordJump() {
    ctx.setState((s) => jumplist.pushCurrent(s, ctx.getVimState()))
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

      recordJump()
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
    const [scanStart, scanEnd] = getSelectionRange(vimState) ?? [vimState.line, vimState.line]
    // Every commentable line the selection covers. A comment on a block is
    // anchored to its last line and carries the first, which is the shape
    // GitHub's review API wants (spec 076).
    const covered = []
    for (let i = scanStart; i <= scanEnd; i++) {
      const candidate = lineMapping.getCommentAnchor(i)
      if (candidate) covered.push(candidate)
    }
    const first = covered[0]
    // A selection that crosses files or sides is not a range GitHub can
    // take; the first line it covers is then the whole of it.
    const sameBlock = covered.filter(
      (candidate) => candidate.filename === first?.filename && candidate.side === first?.side
    )
    const last = sameBlock[sameBlock.length - 1]
    const anchor = first && last ? { ...first, line: last.line } : undefined
    const blockStart = first && last && first.line < last.line ? first.line : undefined
    if (!anchor) {
      // Say why rather than no-op: an expanded line looks exactly as
      // commentable as any other, so silence reads as a broken key.
      let outsideDiff = false
      for (let i = scanStart; i <= scanEnd && !outsideDiff; i++) {
        outsideDiff = lineMapping.isOutsideDiff(i)
      }
      if (mode === "compose" && outsideDiff) {
        ctx.setState((st) =>
          showToast(
            st,
            "GitHub can't anchor a comment outside the diff — only lines shown in a hunk",
            "info",
          )
        )
        ctx.render()
        setTimeout(() => {
          ctx.setState(clearToast)
          ctx.render()
        }, 3500)
        return true
      }
      return false
    }

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
        st, anchor!.filename, anchor!.line, anchor!.side, mode, blockStart
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

  /** What the picker is called, which is the difference `gx` and `gX` make. */
  function linksTitle(action: "open" | "copy"): string {
    return action === "copy" ? "Copy a link" : "Links"
  }

  /**
   * The links in a piece of text, to pick one from (spec 077).
   *
   * A rendered comment has no cursor to put on a link the way the diff
   * does, so riff lists what it found. One link is not a question worth
   * asking, and none is worth saying out loud rather than opening an empty
   * picker.
   */
  function openLinksPicker(
    sources: readonly LinkSource[],
    title: string,
    action: "open" | "copy" = "open",
  ): void {
    const links = collectFromSources(sources, {
      repo: referenceRepo(),
      resolved: resolvedReferences(),
    })

    if (links.length === 0) {
      ctx.setState((s) => showToast(s, "No links here", "info"))
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
      return
    }
    if (links.length === 1) {
      openLink(action, links[0]!)
      return
    }
    ctx.setState((s) =>
      openActionSubmenu(openActionMenu(s), { kind: "links", links, action, title })
    )
    ctx.render()
  }

  /**
   * Open a link in the browser, or put it on the clipboard. riff never
   * ticks a deploy checkbox — a row opens and copies, and that is all it
   * does (spec 068).
   */
  function openLink(action: "open" | "copy", link: { label: string; url: string }): void {
    if (action === "open") {
      Bun.spawn([openerCommand(), link.url], { stdout: "ignore", stderr: "ignore" })
      return
    }
    void copyToClipboard(link.url).then((copied) => {
      ctx.setState((s) =>
        showToast(
          s,
          copied.ok ? `Copied ${link.label}` : `Copy failed: ${copied.error}`,
          copied.ok ? "success" : "error"
        )
      )
      ctx.render()
      setTimeout(() => {
        ctx.setState(clearToast)
        ctx.render()
      }, 2000)
    })
  }

  /**
   * What the feed needs to act: where its rows lead, and the files of a
   * commit row that has just been opened (spec 070).
   */
  function feedContext(): feed.FeedInputContext {
    return {
      state: ctx.getState(),
      setState: ctx.setState,
      render: ctx.render,
      chordPending: pendingKey !== null,
      onOpenEvent: (event) => {
        const target = event.target
        if (!target) return
        recordJump()
        switch (target.kind) {
          case "commit":
            // The diff, scoped to that commit — `]g`/`[g` already know how.
            ctx.setState((s) => switchView(s, "diff"))
            ctx.onCommitSelected(target.sha)
            return
          case "comment": {
            const comment = ctx.getState().comments.find((c) => c.id === target.commentId)
            if (!comment) return
            ctx.setState((s) => switchView(s, "diff"))
            commentsPicker.jumpToComment(comment, {
              getState: ctx.getState,
              setState: ctx.setState,
              getVimState: ctx.getVimState,
              setVimState: ctx.setVimState,
              getLineMapping: ctx.getLineMapping,
              ensureCursorVisible: ctx.ensureCursorVisible,
              render: ctx.render,
              fileNavContext: ctx.fileNavContext,
            })
            return
          }
          case "check":
          case "url": {
            const url = target.kind === "check" ? target.url : target.url
            if (url) Bun.spawn([openerCommand(), url], { stdout: "ignore", stderr: "ignore" })
            return
          }
        }
      },
      onOpenCommitFile: (sha, filename) => {
        recordJump()
        ctx.setState((s) => switchView(s, "diff"))
        ctx.onCommitSelected(sha, filename)
      },
      onExpandCommit: (sha) => {
        void feed.loadCommitFiles(ctx.feedLoadContext, sha)
      },
    }
  }

  return function handleKeypress(key: KeyEvent) {
    // F12 toggles debug console
    if (key.name === "f12") {
      ctx.renderer.console.toggle()
      return
    }

    // ========== FLASH JUMP (captures all input while active, specs 022, 066) ==========
    // Ahead of the panels: a label is typed into whichever surface is being
    // labelled, and that surface's own keys must not see it first.
    if (flash.handleInput(key, { flashState: ctx.getFlashState(), flashHandler: ctx.flashHandler })) {
      return
    }

    // ========== ACTION MENU (captures all input when open) ==========
    if (
      actionMenu.handleInput(key, {
        state: ctx.getState(),
        getVimState: ctx.getVimState,
        setState: ctx.setState,
        render: ctx.render,
        executeAction: ctx.executeAction,
        onToggleReaction: ctx.onToggleReaction,
        onLink: openLink,
      })
    ) {
      return
    }

    // ========== FILE PICKER (captures all input when open) ==========
    if (
      filePicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onFileSelected: () => {
          ctx.setVimState(createCursorState())
          ctx.rebuildLineMapping()
        },
        revealFile: (fileIndex: number) =>
          fileNavigation.revealFile(fileIndex, ctx.fileNavContext),
        recordJump,
      })
    ) {
      return
    }

    // ========== COMMENTS PICKER (captures all input when open, spec 044) ==========
    if (
      commentsPicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        recordJump,
        onSelectComment: (comment) => {
          commentsPicker.jumpToComment(comment, {
            getState: ctx.getState,
            setState: ctx.setState,
            getVimState: ctx.getVimState,
            setVimState: ctx.setVimState,
            getLineMapping: ctx.getLineMapping,
            ensureCursorVisible: ctx.ensureCursorVisible,
            render: ctx.render,
            fileNavContext: ctx.fileNavContext,
          })
        },
      })
    ) {
      return
    }

    // ========== COMMIT PICKER (captures all input when open) ==========
    if (
      commitPicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onCommitSelected: (sha, filename, scope) => {
          recordJump()
          ctx.onCommitSelected(sha, filename, scope)
        },
      })
    ) {
      return
    }

    // ========== SYNC PREVIEW (captures all input when open) ==========
    if (
      syncPreview.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onExecuteSync: () => prOperations.handleExecuteSync(ctx.prOperationsContext),
      })
    ) {
      return
    }

    // ========== REVIEW PREVIEW (captures all input when open) ==========
    const currentState = ctx.getState()
    if (
      reviewPreview.handleInput(key, {
        state: currentState,
        setState: ctx.setState,
        render: ctx.render,
        getValidatedComments: () =>
          commentsFeature.validateCommentsForSubmit(
            reviewCandidates(currentState.comments),
            currentState.files
          ),
        isOwnPr:
          currentState.prInfo !== null &&
          ctx.reviewPreviewOpenContext.getCachedCurrentUser() === currentState.prInfo.author,
        onConfirmReview: () => prOperations.handleConfirmReview(ctx.prOperationsContext),
      })
    ) {
      return
    }

    // ========== HELP OVERLAY (modal: g? toggles it, Esc or q closes) ==========
    // Ahead of the panels, which are modal in their own right: the keymap
    // is drawn over them, so `q` has to close it rather than close them.
    if (ctx.getState().showHelp && !pendingKey) {
      if (key.name === "escape" || key.name === "q") {
        ctx.setState(toggleHelp)
        ctx.render()
        return
      }
      // `g` still has to reach the chord matcher, or `g?` couldn't close it.
      if (!(key.name === "g" && !key.ctrl && !key.shift)) {
        return
      }
    }

    // ========== INLINE COMMENT OVERLAY (captures all input when open) ==========
    if (
      inlineCommentOverlay.handleInput(key, {
        getState: ctx.getState,
        setState: ctx.setState,
        render: ctx.render,
        source: ctx.commentsContext.source,
        getCachedCurrentUser: ctx.commentsContext.getCachedCurrentUser,
        handleReplyExternal: () =>
          commentsFeature.handleAddComment(ctx.commentsContext),
        handleEditExternal: () =>
          commentsFeature.handleAddComment(ctx.commentsContext),
        handleDelete: (comment) =>
          commentsFeature.handleDeleteComment(ctx.commentsContext, comment),
        handleSubmit: (comment) =>
          commentsFeature.handleSubmitSingleComment(ctx.commentsContext, comment),
        handleToggleResolved: (thread) =>
          prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread),
        handleJumpAdjacent: (direction) =>
          threadMotion.jumpOverlayToAdjacentThread(direction, ctx.threadMotionContext),
        onToggleHelp: () => {
          ctx.setState(toggleHelp)
          ctx.render()
        },
        onOpenLinks: (comment, action) => {
          // The panel's comments, the highlighted one first: the same list
          // the overview offers, scoped to what this panel is showing.
          const rest = getInlineCommentOverlayComments(ctx.getState()).filter(
            (other) => other.id !== comment.id
          )
          openLinksPicker(
            [comment, ...rest].map((c) => ({
              title: `@${c.author || "you"}`,
              text: c.localEdit ?? c.body,
            })),
            linksTitle(action),
            action
          )
        },
        getCommentedLines: () => {
          // What the comment replaces, read off the diff rows themselves —
          // the file's own text, not the padded display form (spec 076).
          const ov = ctx.getState().inlineCommentOverlay
          const mapping = ctx.getLineMapping()
          const wanted = ov.side === "LEFT" ? "oldLineNum" : "newLineNum"
          const from = ov.startLine ?? ov.line
          const found: string[] = []
          for (let row = 0; row < mapping.lineCount; row++) {
            const line = mapping.getLine(row)
            if (!line || line.filename !== ov.filename) continue
            const number = line[wanted]
            if (number === undefined || number < from || number > ov.line) continue
            if (line.type === (ov.side === "LEFT" ? "addition" : "deletion")) continue
            found.push(line.sourceContent ?? line.content)
          }
          return found.length > 0 ? found : null
        },
        handleStartNewComment: () => {
          // Start a new comment for the diff cursor's current line.
          // Silently no-op when the cursor isn't on a commentable line —
          // the panel hint footer already advertises `n`, so the user
          // can move the cursor and try again.
          const lineMapping = ctx.getLineMapping()
          const vimState = ctx.getVimState()
          const anchor = lineMapping.getCommentAnchor(vimState.line)
          if (!anchor) {
            ctx.setState((s) =>
              showToast(s, "Move cursor to a commentable line first", "info")
            )
            ctx.render()
            setTimeout(() => {
              ctx.setState(clearToast)
              ctx.render()
            }, 2500)
            return
          }
          ctx.setState((s) =>
            openInlineCommentOverlay(
              s,
              anchor.filename,
              anchor.line,
              anchor.side,
              "compose"
            )
          )
          ctx.render()
        },
        handleCopyLink: (comment) => {
          void ctx.handleCopyCommentLink(comment)
        },
        handleOpenInEditor: (comment) => {
          void externalTools.handleOpenFileAtLine(
            ctx.externalToolsContext,
            comment.filename,
            comment.line
          )
        },
        handleOpenImages: (comment) => {
          inlineCommentOverlay.openCommentImages(ctx, comment)
        },
        openDraftInEditor: async (current) => {
          const s = ctx.getState()
          const username =
            (s.appMode === "pr" && ctx.commentsContext.getCachedCurrentUser()) || "@you"
          const context = inlineCommentOverlay.buildComposerEditorContext(
            s,
            ctx.getLineMapping(),
            username
          )
          ctx.externalToolsContext.suspendRenderer()
          try {
            return await openTextInEditor(current, context)
          } finally {
            ctx.externalToolsContext.resumeRenderer()
          }
        },
        syncCursorToHighlight: () => {
          // Mirror j/k navigation in the panel onto the diff cursor: jump
          // to the source line of the highlighted comment so the diff
          // scrolls along with the panel. Cross-file moves switch files
          // first in single-file view.
          const s = ctx.getState()
          const ov = s.inlineCommentOverlay
          if (!ov.open) return
          const derived = getInlineCommentOverlayDisplayOrder(s)
          const highlighted = derived[ov.highlightedIndex]
          if (!highlighted) return

          // Opened over the overview or the feed, the panel is talking about
          // code that is not on screen. Moving to a comment is the moment
          // the reader asked to see it, so the diff comes back then — not on
          // `Ctrl-t`, which is just "show me what was said". `Ctrl-o` goes
          // back to where the overview was.
          if (s.viewMode !== "diff") {
            recordJump()
            ctx.setState((st) => ({ ...st, viewMode: "diff", previousView: st.viewMode }))
          }

          const inSingleFileView = s.selectedFileIndex !== null
          const targetFileIndex = s.files.findIndex((f) => f.filename === highlighted.filename)
          if (
            inSingleFileView &&
            targetFileIndex !== -1 &&
            targetFileIndex !== s.selectedFileIndex
          ) {
            fileNavigation.handleSelectFile(targetFileIndex, ctx.fileNavContext)
          } else {
            fileNavigation.ensureFileExpanded(highlighted.filename, ctx.fileNavContext)
          }

          const mapping = ctx.getLineMapping()
          const visualLine = mapping.findLineForComment(highlighted)
          if (visualLine !== null) {
            ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
            ctx.ensureCursorVisible()
          }
        },
      })
    ) {
      return
    }

    // ========== PR INFO PANEL (captures input while viewing PR overview) ==========
    // Runs after all modal overlays so they get first crack at keys like 1/2/3.
    if (
      prInfoPanelFeature.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: ctx.getPrInfoPanel,
        onJumpToFile: (filename) => {
          // Jump to file by filename. recordJump runs inside the panel
          // input handler BEFORE closePRInfoPanel, so the jump captures
          // viewMode="pr" — back-jump can return to the PR view.
          const state = ctx.getState()
          const fileIndex = state.files.findIndex((f) => f.filename === filename)
          if (fileIndex !== -1) {
            fileNavigation.handleSelectFile(fileIndex, ctx.fileNavContext)
          }
        },
        onOpenThread: (rootCommentId) => {
          // Enter on a Conversation thread lands on the thread view. The
          // panel already closed (back into the diff), so reuse the
          // comments-picker jump: switch file, park the cursor on the
          // anchor line, open the inline comment overlay.
          const comment = ctx.getState().comments.find((c) => c.id === rootCommentId)
          if (!comment) return
          commentsPicker.jumpToComment(comment, {
            getState: ctx.getState,
            setState: ctx.setState,
            getVimState: ctx.getVimState,
            setVimState: ctx.setVimState,
            getLineMapping: ctx.getLineMapping,
            ensureCursorVisible: ctx.ensureCursorVisible,
            render: ctx.render,
            fileNavContext: ctx.fileNavContext,
          })
        },
        onOpenFileAtLine: (filename, line) => {
          void externalTools.handleOpenFileAtLine(ctx.externalToolsContext, filename, line)
        },
        onActivateCommit: (sha) => {
          // Activate commit (set viewing commit). Jump push happens in
          // the panel input handler before closePRInfoPanel.
          ctx.onCommitSelected(sha)
        },
        onToggleThreadResolved: (rootCommentId) => {
          // Resolve the review thread whose root has this id. Built from
          // live state.comments so mutations/refresh reflect immediately.
          const state = ctx.getState()
          const threads = groupIntoThreads(state.comments)
          const thread = threads.find((t) => t.id === rootCommentId)
          if (!thread) return
          void prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread)
        },
        executeAction: ctx.executeAction,
        onOpenLinks: (action) => {
          const sources = ctx.getPrInfoPanel()?.linkSources() ?? []
          openLinksPicker(sources, linksTitle(action), action)
        },
        onToggleHelp: () => {
          ctx.setState(toggleHelp)
          ctx.render()
        },
        onPreviewRow: (action, row) => {
          // Several places for one app: the same picker every other list of
          // links uses, told whether it was `Enter` or `y` that asked. Only
          // this row, because the key was pressed on this row.
          openLinksPicker(
            [{ title: row.app, links: row.links }],
            `${action === "open" ? "Open" : "Copy"} — ${row.app}`,
            action
          )
        },
        recordJump,
      })
    ) {
      return
    }

    // ========== FEED (owns its keys while it is the view, specs 065, 070) ==========
    if (feed.handleInput(key, feedContext())) {
      return
    }

    // ========== CONFIRMATION DIALOG (y/n to confirm/cancel) ==========
    {
      const dialogState = ctx.getState()
      if (dialogState.confirmDialog) {
        if (key.name === "y" || key.name === "Y") {
          dialogState.confirmDialog.onConfirm()
          return
        } else if (key.name === "n" || key.name === "N" || key.name === "escape") {
          dialogState.confirmDialog.onCancel()
          return
        }
        // Other keys are ignored while dialog is open
        return
      }
    }

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
        recordJump,
      })

    // ========== FILE TREE FILTER PROMPT (captures input while open) ==========
    // Before the global single-key handlers, or typing a path would toggle
    // the PR view on `i` and quit on `q`.
    if (ctx.getState().treeFilterInput && dispatchToTree()) {
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

      case "g":
        // Ctrl-g is the commit picker — `g` is riff's letter for commits
        // (`]g`, `[g`), and the picker was two keystrokes and a search away
        // in the palette. The file-path toast it used to show is still there
        // as Show File Path.
        if (key.ctrl) {
          if (state.commits.length > 0) {
            key.preventDefault()
            ctx.setState(openCommitPicker)
            ctx.render()
          }
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
        if (switched === state) break
        recordJump()
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

      case "g":
      case "G":
        if ((key.name === "G" || key.shift) && state.focusedPanel !== "diff") {
          folds.handleGoToBottom(ctx.foldsContext)
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
        if (state.mode === "normal") {
          if (state.focusedPanel === "comments") {
            ctx.setState((s) => ({ ...s, focusedPanel: "diff" }))
            ctx.render()
            return
          }
          if (state.showFilePanel && state.focusedPanel === "diff") {
            ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
            ctx.render()
            return
          }
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
          // Ctrl-l moves focus one panel right: tree → diff → comments.
          // From tree we also drop any visual-line selection so it
          // doesn't linger as dormant state.
          ctx.setState((s) => {
            if (s.focusedPanel === "tree") {
              return { ...s, focusedPanel: "diff", treeSelectionAnchor: null }
            }
            if (s.focusedPanel === "diff" && s.inlineCommentOverlay.open) {
              return { ...s, focusedPanel: "comments" }
            }
            return s
          })
          ctx.render()
          setTimeout(() => {
            ctx.render()
          }, 0)
          return
        }
        break
    }

    // ========== KEY SEQUENCES (]f, [f, gS, etc.) ==========
    if (pendingKey) {
      const keyChar = key.name || (key.sequence?.length === 1 ? key.sequence : "")
      const sequence = `${pendingKey}${keyChar}${key.shift ? "!" : ""}`
      clearPendingKey()

      const s = ctx.getState()

      if (sequence === "]f") {
        recordJump()
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
        recordJump()
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
        recordJump()
        fileNavigation.navigateToUnviewedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[u") {
        recordJump()
        fileNavigation.navigateToUnviewedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]o") {
        recordJump()
        fileNavigation.navigateToOutdatedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[o") {
        recordJump()
        fileNavigation.navigateToOutdatedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]r") {
        recordJump()
        threadMotion.navigateToThread(1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "[r") {
        recordJump()
        threadMotion.navigateToThread(-1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "]n") {
        // The comments that arrived since your last visit, in order (spec 069).
        recordJump()
        threadMotion.navigateToThread(1, false, ctx.threadMotionContext, true)
        return
      } else if (sequence === "[n") {
        recordJump()
        threadMotion.navigateToThread(-1, false, ctx.threadMotionContext, true)
        return
      } else if (sequence === "]R!") {
        recordJump()
        threadMotion.navigateToThread(1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "[R!") {
        recordJump()
        threadMotion.navigateToThread(-1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "gS!" || sequence === "gs!") {
        reviewPreview.handleOpenReviewPreview(ctx.reviewPreviewOpenContext)
        return
      } else if (sequence === "gs") {
        syncPreview.handleOpenSyncPreview(ctx.syncPreviewOpenContext)
        return
      } else if (sequence === "go") {
        if (s.appMode === "pr" && s.prInfo) {
          const { owner, repo, number: prNumber } = s.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      } else if (sequence === "gi") {
        if (s.appMode === "pr" && s.prInfo) {
          recordJump()
          prInfoPanelFeature.handleOpenPRInfoPanel(ctx.prInfoPanelOpenContext)
        }
        return
      } else if (sequence === "gy") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("copy-pr-url")
        }
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
        // Both versions of this file, side by side (spec 075). Claude's
        // drafted comment used to own this key; it is a palette action now,
        // since a key that means two things depending on a notification is
        // a key you cannot trust.
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
        recordJump()
        folds.handleGoToTop(ctx.foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        recordJump()
        folds.handleGoToBottom(ctx.foldsContext)
        return
      } else if (sequence === "za") {
        // In the feed, `za` opens a commit row into the files it touched.
        if (s.viewMode === "feed") {
          feed.toggleExpandedRow(feedContext())
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
        // there and is dropped while wrapping. The view's own rebuild
        // brings the cursor back into view once it has laid out.
        ctx.setState(toggleWrapLines)
        ctx.rebuildLineMapping()
        ctx.render()
        return
      } else if (sequence === "zl" || sequence === "zh") {
        scrollColumns(sequence === "zl" ? 1 : -1)
        return
      } else if (sequence === "zL!" || sequence === "zl!" || sequence === "zH!" || sequence === "zh!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        const forward = sequence === "zL!" || sequence === "zl!"
        scrollColumns(ctx.vimDiffView.halfColumnWindow(ctx.getVimState().line) * (forward ? 1 : -1))
        return
      } else if (sequence === "zs" || sequence === "ze") {
        const vimState = ctx.getVimState()
        ctx.vimDiffView.scrollColumnToEdge(
          vimState.line,
          vimState.col,
          sequence === "zs" ? "start" : "end"
        )
        ctx.render()
        return
      } else if (sequence === "zz" || sequence === "zt" || sequence === "zb") {
        ctx.vimDiffView.scrollCursorTo(
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
          recordJump()
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
          recordJump()
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

    if (key.name === "]" || key.name === "[" || (key.name === "g" && !key.shift) || (key.name === "z" && !key.shift)) {
      pendingKey = key.name
      pendingTimeout = setTimeout(clearPendingKey, 500)
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
      vimDiffView: ctx.vimDiffView,
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
