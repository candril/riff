/**
 * Action execution.
 *
 * Executes actions selected from the action menu. Actions can be simple
 * state updates or complex async operations that involve multiple features.
 */

import type { AppState } from "../../state"
import {
  openFilePicker,
  openCommitPicker,
  toggleFilePanel,
  toggleViewMode,
  clearFileSelection,
  showToast,
  clearToast,
  toggleShowHiddenFiles,
  openHelp,
} from "../../state"

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
    case "help":
      setState(openHelp)
      render()
      break

    case "quit":
      handlers.quit()
      break

    case "find-files":
      setState(openFilePicker)
      render()
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

    case "open-in-editor":
      handlers.handleOpenFileInEditor()
      break

    case "checkout-and-edit":
      handlers.handleCheckoutAndEdit()
      break

    case "show-all-files":
      setState((s) => {
        const cleared = clearFileSelection(s)
        return { ...cleared, focusedPanel: s.viewMode === "diff" ? "diff" as const : "comments" as const }
      })
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
  }
}
