/**
 * Action execution.
 *
 * Executes actions selected from the action menu. Actions can be simple
 * state updates or complex async operations that involve multiple features.
 */

import type { AppState } from "../../state"
import {
  toggleFilePanel,
  toggleFilePanelExpanded,
  switchView,
  toggleWrapLines,
  clearFileSelection,
  toggleShowHiddenFiles,
  getReactionsForTarget,
} from "../../state"
import { REACTION_META } from "../../types"
import { actions } from "../../actions/registry"
import { actionKeys, type ActionSubmenu } from "../../actions/types"
import { copyToClipboard } from "../../utils/clipboard"
import type { FilePickerState } from "../file-picker/state"
import type { CommentsPickerState } from "../comments-picker/state"
import type { OccurrencePickerState } from "../occurrence-picker/state"
import type { MarksPickerState } from "../marks/picker-state"
import type { CommitPickerState } from "../commit-picker/state"
import type { ActionMenuState } from "./state"
import type { LinePeekState } from "../line-peek/state"
import * as viewFilter from "../../app/view-filter"
import type { ToastState } from "../toast/state"

/**
 * Handlers that the action executor needs access to.
 * These are passed in from app.ts since they involve complex coordination.
 */
export interface ActionHandlers {
  quit: () => void
  handleRefresh: () => Promise<void>
  handleOpenReviewPreview: () => Promise<void>
  handleOpenSyncPreview: () => void
  handleSubmitSingleComment: () => Promise<void>
  handleDeleteComment: () => Promise<void>
  handleClearLocalComments: () => Promise<void>
  handleOpenPRInfoPanel: () => Promise<void>
  handleOpenInBoard: () => void
  handleOpenFileInEditor: () => Promise<void>
  handleDiffFileInEditor: (opts?: { tmux?: boolean }) => Promise<void>
  handleOpenFileInTmuxWindow: () => Promise<void>
  handleCheckoutAndEdit: () => Promise<void>
  handleOpenExternalDiff: (viewer: "difftastic" | "delta" | "nvim") => Promise<void>
  handleShowAllFiles: () => void
  handleOpenFileAlone: () => void
  handleToggleSplitView: () => void
  handleEditPr: () => Promise<void>
  /** Reopen riff on the PR this branch already has (spec 079). */
  handleReviewBranchPr: (prNumber: number) => void
  handleCreatePr: () => Promise<void>
  handleAddPrComment: () => Promise<void>
  handleCopyPermalink: (options: { includeLines: boolean }) => Promise<void>
  handleCopyPrDiffLink: () => Promise<void>
  handleCopyCommentLink: () => Promise<void>
  handleYank: (options: { raw: boolean }) => void
  /** Resolves false when the cursor isn't on a collapsed-context divider. */
  handleExpandDivider: () => Promise<boolean>
  handleToggleOpenThreadsOnly: () => void
  handleToggleUnviewedFilesOnly: () => void
  /** The path of the file at the cursor, or the tree's highlighted one, as a toast. */
  handleShowFilePath: () => void
}

export interface ExecuteContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  filePicker: Pick<FilePickerState, "show">
  commentsPicker: Pick<CommentsPickerState, "show">
  occurrencePicker: Pick<OccurrencePickerState, "show">
  marksPicker: Pick<MarksPickerState, "show">
  commitPicker: Pick<CommitPickerState, "show">
  actionMenu: Pick<ActionMenuState, "showSubmenu">
  linePeek: Pick<LinePeekState, "toggle">
  feed: viewFilter.ViewFilterContext["feed"]
  handlers: ActionHandlers
  /** Each keymap command's `keys`, the palette's hints. */
  commandKeys: ReadonlyMap<string, string>
  /** Runs keymap command `name` on the key `keys` spells; false when it did not take it. */
  runCommand: (name: string, keys: string) => boolean
}

/** The diff's catch-all command, which reads its key the way handleInput does. */
const DIFF_KEY_COMMAND = "diff.key"

/** Actions running through their command now: a command that runs one back would loop. */
const runningThroughCommand = new Set<string>()

/**
 * Execute an action by its ID. An action without a case of its own runs
 * the command its key runs, on that key, so it does what the key does.
 * False when nothing ran it: no case, and no command that took the key.
 */
export async function executeAction(
  actionId: string,
  ctx: ExecuteContext
): Promise<boolean> {
  const { state, setState, render, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, linePeek, handlers } = ctx

  switch (actionId) {
    case "quit":
      handlers.quit()
      break

    case "find-files":
      filePicker.show()
      render()
      break

    case "find-comments":
      if (state.comments.length > 0) {
        commentsPicker.show()
        render()
      }
      break

    case "find-marks":
      marksPicker.show()
      render()
      break

    case "find-occurrences":
      if (state.files.length > 0) {
        occurrencePicker.show()
        render()
      }
      break

    case "select-commit":
      if (state.commits.length > 0) {
        commitPicker.show(state.viewingCommitScope, state.commits)
        render()
      }
      break

    case "toggle-file-panel":
      setState((s) => {
        const toggled = toggleFilePanel(s)
        return toggled.showFilePanel
          ? { ...toggled, focusedPanel: "tree" as const }
          : toggled
      })
      render()
      break

    case "filter-view":
      viewFilter.startFilter({ getState: () => state, setState, feed: ctx.feed })
      render()
      break

    case "toggle-view":
      setState((s) => switchView(s, "state"))
      render()
      break

    case "toggle-hidden-files":
      setState(toggleShowHiddenFiles)
      render()
      break

    case "toggle-open-threads-only":
      handlers.handleToggleOpenThreadsOnly()
      break

    case "toggle-unviewed-files-only":
      handlers.handleToggleUnviewedFilesOnly()
      break

    case "toggle-file-panel-expanded":
      setState(toggleFilePanelExpanded)
      render()
      break

    case "refresh":
      handlers.handleRefresh()
      break

    case "submit-review":
      handlers.handleOpenReviewPreview()
      break

    case "sync-changes":
      handlers.handleOpenSyncPreview()
      break

    case "submit-comment":
      await handlers.handleSubmitSingleComment()
      break

    case "delete-comment":
      await handlers.handleDeleteComment()
      break

    case "clear-local-comments":
      await handlers.handleClearLocalComments()
      break

    case "create-pr":
      await handlers.handleCreatePr()
      break

    case "edit-pr":
      if (state.prInfo) {
        await handlers.handleEditPr()
      }
      break

    case "open-in-browser":
      if (state.prInfo) {
        const { owner, repo, number: prNumber } = state.prInfo
        Bun.spawn([
          "gh",
          "pr",
          "view",
          String(prNumber),
          "--web",
          "-R",
          `${owner}/${repo}`,
        ])
      } else if (state.branchPr) {
        // Local mode, but the branch has a PR riff found (spec 079).
        Bun.spawn(["gh", "pr", "view", String(state.branchPr.number), "--web"])
      }
      break

    case "open-branch-pr":
      if (state.branchPr) handlers.handleReviewBranchPr(state.branchPr.number)
      break

    case "pr-info":
      if (state.prInfo) {
        handlers.handleOpenPRInfoPanel()
      }
      break

    case "open-in-board":
      handlers.handleOpenInBoard()
      break

    case "copy-pr-url":
      if (state.prInfo) {
        const copied = await copyToClipboard(state.prInfo.url)
        if (copied.ok) ctx.toast.show("PR URL copied to clipboard", "success")
        else ctx.toast.show(`Copy failed: ${copied.error}`, "error")
        render()
        setTimeout(() => {
          ctx.toast.clear()
          render()
        }, 2000)
      }
      break

    case "copy-permalink":
      await handlers.handleCopyPermalink({ includeLines: true })
      break

    case "copy-file-permalink":
      await handlers.handleCopyPermalink({ includeLines: false })
      break

    case "yank":
      handlers.handleYank({ raw: false })
      break

    case "yank-raw":
      handlers.handleYank({ raw: true })
      break

    case "expand-context": {
      const expanded = await handlers.handleExpandDivider()
      if (!expanded) {
        ctx.toast.show("Put the cursor on a \"… lines\" divider first", "info")
        render()
        setTimeout(() => {
          ctx.toast.clear()
          render()
        }, 2500)
      }
      break
    }

    case "copy-comment-link":
      await handlers.handleCopyCommentLink()
      break

    case "copy-pr-diff-link":
      await handlers.handleCopyPrDiffLink()
      break

    case "add-pr-comment":
      await handlers.handleAddPrComment()
      break

    case "diff-in-editor":
      handlers.handleDiffFileInEditor()
      break

    case "diff-in-tmux-pane":
      handlers.handleDiffFileInEditor({ tmux: true })
      break

    case "open-in-editor":
      handlers.handleOpenFileInEditor()
      break

    case "open-in-tmux-window":
      handlers.handleOpenFileInTmuxWindow()
      break

    case "checkout-and-edit":
      handlers.handleCheckoutAndEdit()
      break

    case "toggle-wrap":
      setState(toggleWrapLines)
      render()
      break

    case "toggle-split":
      handlers.handleToggleSplitView()
      break

    case "peek-line":
      linePeek.toggle()
      render()
      break

    case "open-file-alone":
      handlers.handleOpenFileAlone()
      break

    case "show-all-files":
      setState((s) => ({ ...clearFileSelection(s), focusedPanel: "diff" as const }))
      handlers.handleShowAllFiles()
      render()
      break

    case "diff-difftastic":
      handlers.handleOpenExternalDiff("difftastic")
      break

    case "diff-delta":
      handlers.handleOpenExternalDiff("delta")
      break

    case "diff-nvim":
      handlers.handleOpenExternalDiff("nvim")
      break

    case "react": {
      // Open the react submenu rather than executing — the palette stays
      // open and the selected row's Enter handler fires the toggle.
      const submenu = reactSubmenu(state, true)
      if (!submenu) break
      actionMenu.showSubmenu(submenu)
      render()
      break
    }

    case "show-file-path":
      handlers.handleShowFilePath()
      break

    default:
      return runThroughCommand(actionId, ctx)
  }
  return true
}

function runThroughCommand(actionId: string, ctx: ExecuteContext): boolean {
  const action = actions.find((candidate) => candidate.id === actionId)
  const keys = action ? actionKeys(action, ctx.commandKeys) : null
  if (!action?.command || keys === null || runningThroughCommand.has(actionId)) return false
  // The diff's keys answer only with the diff focused, and these entries
  // name the diff: Search in Diff from the tree searches the diff rather
  // than filtering the tree, as `/` there would.
  if (action.command === DIFF_KEY_COMMAND) ctx.setState((s) => ({ ...s, focusedPanel: "diff" as const }))
  runningThroughCommand.add(actionId)
  try {
    return ctx.runCommand(action.command, keys)
  } finally {
    runningThroughCommand.delete(actionId)
  }
}

/**
 * The reaction picker on whatever `reactionTarget` points at, or null when
 * nothing reactable has focus. `+` opens it without the palette, and
 * showSubmenu opens the palette underneath it then.
 */
export function reactSubmenu(state: AppState, fromPalette: boolean): ActionSubmenu | null {
  const target = state.reactionTarget
  if (state.appMode !== "pr" || !target) return null
  return { kind: "react", target, title: reactSubmenuTitle(state), fromPalette }
}

/**
 * Build the submenu title for the React… submenu. Surfaces what the user is
 * about to react on so they're not toggling into the void.
 */
function reactSubmenuTitle(state: AppState): string {
  const target = state.reactionTarget
  if (!target) return "React"
  switch (target.kind) {
    case "review-comment": {
      const c = state.comments.find(c => c.githubId === target.githubId)
      if (!c) return "React"
      const author = c.author ? `@${c.author}` : ""
      const where = `${c.filename}:${c.line}`
      return author ? `React on ${where} (${author})` : `React on ${where}`
    }
    case "issue-comment": {
      const c = state.prInfo?.conversationComments?.find(c => c.id === target.githubId)
      const author = c?.author ? ` (@${c.author})` : ""
      return `React on conversation comment${author}`
    }
    case "review": {
      const r = state.prInfo?.reviews?.find(r => r.databaseId === target.reviewId)
      const author = r?.author ? ` (@${r.author})` : ""
      return `React on review${author}`
    }
    case "issue":
      return `React on PR #${target.prNumber}`
  }
}

/** Small helper exported for tests/debugging: describe the current
 * reaction set as a tiny comma-separated string. Not used at runtime yet. */
export function describeReactions(state: AppState): string {
  const t = state.reactionTarget
  if (!t) return ""
  const rs = getReactionsForTarget(state, t)
  return rs.map(r => `${REACTION_META[r.content].emoji}${r.count}`).join(" ")
}
