/**
 * App render coordination
 *
 * Creates the main render function that orchestrates all UI updates.
 */

import { TextRenderable } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { keepAlive } from "../utils/renderables"
import {
  collectMentionCandidates,
  detectMentionTrigger,
} from "../utils/mentions"
import { detectEmojiTrigger } from "../utils/emoji"
import { setMentionPicker, setEmojiPicker, markCommentsSeen } from "../state"
import { requestMentionSearch } from "../features/mentions"
import type { ThreadPanelIsland } from "./thread-panel"
import type { ChatColumnIsland } from "./chat-column"
import type { ChatState } from "../features/chat/state"
import { chatColumnWidth } from "../features/chat/width"
import type { SearchPromptIsland } from "./prompt-line"
import type { FeedIsland } from "./feed"
import type {
  ActionMenuIsland,
  CommentsPickerIsland,
  CommitPickerIsland,
  FilePickerIsland,
  MarksPickerIsland,
  OccurrencePickerIsland,
} from "./pickers"
import type { StatusBarIsland } from "./status-bar"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import { getInlineCommentOverlayComments } from "../state"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { selectionStatus } from "./selection-status"
import type { FileParses } from "../vim-diff/file-parses"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import { flashLabelsOn, type FlashState } from "../vim-diff/flash-state"
import { diffColumnStatus, splitOn as isSplitOn } from "./column-status"
import { chatInputFocused, composerOpen, diffCursorShown } from "./diff-focus"
import { openPrompt } from "./open-prompt"
import { routePrompt, type PromptIsland, type PromptOwner } from "./prompt-routing"
import type { AppShell } from "./shell"
import type { Frame } from "./frame"

export interface RenderContext {
  // Mutable state accessors
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getFlashState: () => FlashState
  getCachedCurrentUser: () => string | null
  /** Returns the persistent PRInfoPanel instance (PR mode only; null in local mode). */
  getPrInfoPanel: () => PRInfoPanelClass | null
  // UI panels
  renderer: CliRenderer
  shell: AppShell
  statusBar: StatusBarIsland
  threadPanel: ThreadPanelIsland
  chatColumn: ChatColumnIsland
  /** The one conversation with riff's agent, which outlives the column's opening and closing. */
  chat: ChatState
  searchPrompt: SearchPromptIsland
  feed: FeedIsland
  filePicker: FilePickerIsland
  commentsPicker: CommentsPickerIsland
  marksPicker: MarksPickerIsland
  occurrencePicker: OccurrencePickerIsland
  commitPicker: CommitPickerIsland
  actionMenu: ActionMenuIsland
  split: SplitDiff
  unified: UnifiedDiff
  /** The files' own text and their parses, which both diff views colour rows from. */
  parses: FileParses
  // Helper
  updateFileTreePanel: () => void
  /** Incremental search reacting to what the prompt field reports (spec 065). */
  updateSearchPattern: (value: string) => void
  /** Hands the pass's snapshot to every view that derives its own model from it. */
  publishFrame: (frame: Frame) => void
}

/**
 * Create the main render function
 */
export function createRenderFunction(ctx: RenderContext): () => void {
  const errorText = keepAlive(new TextRenderable(ctx.renderer, { fg: colors.error }))
  const emptyText = keepAlive(new TextRenderable(ctx.renderer, { content: "No changes to display", fg: colors.textDim }))
  const promptIslands: Record<PromptOwner, PromptIsland> = {
    search: ctx.searchPrompt,
    "file-picker": ctx.filePicker,
    "comments-picker": ctx.commentsPicker,
    "marks-picker": ctx.marksPicker,
    "occurrence-picker": ctx.occurrencePicker,
    "commit-picker": ctx.commitPicker,
    "action-menu": ctx.actionMenu,
    "feed-filter": ctx.feed,
    "comments-filter": ctx.threadPanel,
  }

  return function render() {
    const state = ctx.getState()
    const vimState = ctx.getVimState()
    const lineMapping = ctx.getLineMapping()
    const searchState = ctx.getSearchState()
    const flashState = ctx.getFlashState()
    const frame: Frame = {
      state,
      vimState,
      mapping: lineMapping,
      searchState,
      flashState,
      cachedCurrentUser: ctx.getCachedCurrentUser(),
      width: ctx.renderer.width,
      height: ctx.renderer.height,
      now: Date.now(),
    }

    // Update file tree panel state
    ctx.updateFileTreePanel()
    // After the panel update, which sets the width the diff pane is measured against.
    const splitOn = isSplitOn(state, ctx.split)

    const ov = state.inlineCommentOverlay
    const composerActive = composerOpen(state)
    const prompt = openPrompt(state, ctx, render)
    const diffFocused = diffCursorShown(state, prompt !== null)

    // Main content based on view mode. It is mounted once the thread panel
    // is built, which has to wait for the composer's session below.
    let view
    let withTree = true
    let unifiedOn = false
    const prInfoPanelInstance = ctx.getPrInfoPanel()
    if (state.error) {
      errorText.content = `Error: ${state.error}`
      view = errorText
      withTree = false
    } else if (state.viewMode === "state" && prInfoPanelInstance) {
      // PR overview (spec 041): mount the panel inline next to the tree.
      view = prInfoPanelInstance.getContainer()
    } else if (state.viewMode === "feed") {
      view = ctx.feed.host
    } else if (state.files.length === 0) {
      view = emptyText
      withTree = false
    } else {
      // The text of the files riff has already read, so they can be
      // highlighted as files rather than as the rows on screen (spec 080).
      ctx.parses.set(
        new Map(
          Object.entries(state.fileContentCache).flatMap(([filename, entry]) =>
            entry?.newContent
              ? [[filename, { new: entry.newContent, old: entry.oldContent }] as const]
              : []
          )
        )
      )
      // Fed while split is drawn too, so toggling back has nothing to rebuild.
      ctx.unified.draw({
        mapping: lineMapping,
        state,
        vimState,
        searchState,
        flashState,
        emptyMessage: state.treeFilter ? `No files match /${state.treeFilter}` : "No changes to display",
        focused: diffFocused,
      })
      if (splitOn) ctx.split.draw({ mapping: lineMapping, state, vimState, searchState, flashState })

      view = splitOn ? ctx.split.island.host : ctx.unified.island.host
      unifiedOn = !splitOn
    }
    ctx.unified.syncDrawn(unifiedOn)
    ctx.split.syncDrawn(splitOn, ctx.unified.viewportHeight())

    // Drive the composer textarea's lifecycle from overlay state. We do
    // this BEFORE the frame is published, which shows the thread panel, so the textarea is focused /
    // seeded by the time the panel shows it. With the composer
    // open the diff's cursor is not shown (diffFocused false), which keeps
    // the textarea's cursor visible; otherwise the diff would re-claim it
    // after the textarea's renderCursor pass.
    {
      ctx.threadPanel.compose(
        composerActive
          ? {
              key: `${ov.filename}:${ov.line}:${ov.mode}:${ov.editingId ?? ""}`,
              initialValue: ov.input,
              mode: ov.mode as "compose" | "edit",
              onActivity: (text, cursorOffset) => {
                // Detect `@<query>` against the live textarea state. The
                // mention picker is feature-gated to PR mode (no candidates
                // in local diff review) — `setMentionPicker` short-circuits
                // when there's nothing to set.
                const trigger = detectMentionTrigger(text, cursorOffset)
                ctx.setState((s) => setMentionPicker(s, trigger))
                // And `:shortcode`, which needs nothing fetched (spec 082).
                ctx.setState((s) => setEmojiPicker(s, detectEmojiTrigger(text, cursorOffset)))
                if (trigger) {
                  // Widen the pool for fragments the cached roster can't cover
                  // (large orgs) — debounced, so this is a no-op most keystrokes.
                  requestMentionSearch(
                    { setState: ctx.setState, render },
                    trigger.query,
                    collectMentionCandidates(ctx.getState()),
                  )
                }
                render()
              },
            }
          : null
      )

      // What is on screen has been read (spec 069): the comments the panel
      // is showing, and the threads of an open Conversation section. Being
      // in the PR is not the same as having read it, so nothing else counts.
      if (state.visit) {
        const seen: string[] = []
        if (state.inlineCommentOverlay.open) {
          for (const comment of getInlineCommentOverlayComments(state)) seen.push(comment.id)
        }
        if (state.viewMode === "state" && prInfoPanelInstance?.isSectionExpandedNamed("conversation")) {
          for (const comment of state.comments) seen.push(comment.id)
        }
        ctx.setState((s) => markCommentsSeen(s, seen))
      }

      // Flash labels, painted by whichever surface is being labelled
      // (spec 066). The diff draws its own in its rows.
      prInfoPanelInstance?.setFlashLabels(flashLabelsOn(flashState, "state"))

      // The info panel's filter box is the panel's own, like the tree's:
      // both are persistent panels rather than overlays rebuilt per render.
      prInfoPanelInstance?.syncFilterInput(
        state.prInfoPanel.filterInput,
        state.prInfoPanel.filter
      )
      prInfoPanelInstance?.setFilter(state.prInfoPanel.filter)

      // And the one-line prompts (spec 065), each typed into its own island's field.
      routePrompt(promptIslands, prompt)

      if (splitOn) ctx.split.island.update({ focused: diffFocused })

      // After the composer and the prompts, which focus their own inputs: the
      // chat takes the keys only while neither is up.
      const chatFocused = chatInputFocused(state, prompt !== null)
      ctx.chatColumn.update(
        state.chatOpen ? { state: ctx.chat, width: chatColumnWidth(ctx.renderer.width), focused: chatFocused } : null
      )
      const chatInput = ctx.chatColumn.input()
      if (chatFocused) chatInput?.focus()
      else if (chatInput?.focused) chatInput.blur()
    }

    ctx.statusBar.update({
      searchInfo:
        searchState.pattern && state.viewMode === "diff"
          ? {
              current: searchState.currentMatchIndex + 1,
              total: searchState.matches.length,
              pattern: searchState.pattern,
              wrapped: searchState.wrapped,
            }
          : null,
      columnInfo: diffColumnStatus(splitOn, {
        viewMode: state.viewMode,
        split: ctx.split,
        unified: ctx.unified,
      }),
      // Split counts the rows it draws: a pair row holds a removal and an addition.
      selectionInfo: splitOn ? ctx.split.selectionStatus(vimState) : selectionStatus(vimState),
    })

    // After routePrompt and the chat, which focus their own inputs: the review
    // preview focuses its summary as it opens, before this call returns.
    ctx.publishFrame(frame)

    // The tree has nothing to list without files, whatever the view.
    ctx.shell.setView(view, { withTree: withTree && state.files.length > 0 })

    // Keep the PR-level comment input overlay (a modal *inside* the PR
    // panel) in sync whenever the panel exists — it renders itself only
    // when `commentInputOpen` is true.
    if (prInfoPanelInstance) {
      prInfoPanelInstance.updateCommentInput(
        state.prInfoPanel.commentInputOpen,
        state.prInfoPanel.commentInputText,
        state.prInfoPanel.commentInputLoading,
        state.prInfoPanel.commentInputError
      )
    }
  }
}
