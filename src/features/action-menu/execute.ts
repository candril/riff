/**
 * Action execution.
 *
 * Executes actions selected from the action menu. Actions can be simple
 * state updates or complex async operations that involve multiple features.
 */

import type { AppState } from "../../state"
import {
  openFilePicker,
  openCommentsPicker,
  openCommitPicker,
  toggleFilePanel,
  toggleFilePanelExpanded,
  toggleViewMode,
  clearFileSelection,
  showToast,
  clearToast,
  toggleShowHiddenFiles,
  openActionSubmenu,
  getReactionsForTarget,
} from "../../state"
import { REACTION_META } from "../../types"

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
  handleOpenPRInfoPanel: () => Promise<void>
  handleOpenFileInEditor: () => Promise<void>
  handleCheckoutAndEdit: () => Promise<void>
  handleOpenExternalDiff: (viewer: "difftastic" | "delta" | "nvim") => Promise<void>
  handleShowAllFiles: () => void
  handleEditPr: () => Promise<void>
  handleCreatePr: () => Promise<void>
  handleAddPrComment: () => Promise<void>
  handleAiReviewContextAware: () => Promise<void>
  handleAiReviewFull: () => Promise<void>
  handleReviewDraftedComment: () => Promise<void>
  handleDiscardDraftedComment: () => Promise<void>
}

export interface ExecuteContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  handlers: ActionHandlers
}

/**
 * Execute an action by its ID.
 */
export async function executeAction(
  actionId: string,
  ctx: ExecuteContext
): Promise<void> {
  const { state, setState, render, handlers } = ctx

  switch (actionId) {
    case "quit":
      handlers.quit()
      break

    case "find-files":
      setState(openFilePicker)
      render()
      break

    case "find-comments":
      if (state.comments.length > 0) {
        setState(openCommentsPicker)
        render()
      }
      break

    case "select-commit":
      if (state.commits.length > 0) {
        setState(openCommitPicker)
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

    case "toggle-view":
      setState(toggleViewMode)
      render()
      break

    case "toggle-hidden-files":
      setState(toggleShowHiddenFiles)
      render()
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
      }
      break

    case "pr-info":
      if (state.prInfo) {
        handlers.handleOpenPRInfoPanel()
      }
      break

    case "copy-pr-url":
      if (state.prInfo) {
        const url = state.prInfo.url
        // Use pbcopy on macOS, xclip on Linux
        const proc = Bun.spawn(["pbcopy"], { stdin: "pipe" })
        proc.stdin.write(url)
        proc.stdin.end()
        setState((s) => showToast(s, "PR URL copied to clipboard", "success"))
        render()
        setTimeout(() => {
          setState(clearToast)
          render()
        }, 2000)
      }
      break

    case "add-pr-comment":
      await handlers.handleAddPrComment()
      break

    case "open-in-editor":
      handlers.handleOpenFileInEditor()
      break

    case "checkout-and-edit":
      handlers.handleCheckoutAndEdit()
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

    case "claude-discuss":
      await handlers.handleAiReviewContextAware()
      break

    case "claude-discuss-full":
      await handlers.handleAiReviewFull()
      break

    case "claude-review-drafted-comment":
      await handlers.handleReviewDraftedComment()
      break

    case "claude-discard-drafted-comment":
      await handlers.handleDiscardDraftedComment()
      break

    case "react": {
      // Open the react submenu rather than executing — the palette stays
      // open and the selected row's Enter handler fires the toggle.
      const target = state.reactionTarget
      if (!target) break
      setState((s) =>
        openActionSubmenu(s, {
          kind: "react",
          target,
          title: reactSubmenuTitle(s),
        })
      )
      render()
      break
    }
  }
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
