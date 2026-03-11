/**
 * Refresh feature handlers
 *
 * Full reload of PR data, diff, and comments from scratch.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github"
import type { AppMode } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { SearchState } from "../../vim-diff/search-state"
import type { IgnoreMatcher } from "../../utils/ignore"
import {
  showToast,
  clearToast,
  createInitialState,
  collapseResolvedThreads,
  loadFileStatuses,
  updateFileStatuses,
  collapseViewedFiles,
} from "../../state"
import { loadPrSession } from "../../providers/github"
import { getLocalDiff, getDiffDescription } from "../../providers/local"
import { loadComments, loadViewedStatuses } from "../../storage"
import { parseDiff, sortFiles } from "../../utils/diff-parser"
import { buildFileTree } from "../../utils/file-tree"
import { groupIntoThreads } from "../../utils/threads"
import { createCursorState } from "../../vim-diff/cursor-state"
import { createSearchState } from "../../vim-diff/search-state"

export interface RefreshContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // Reset vim state
  setVimState: (s: VimCursorState) => void
  setSearchState: (s: SearchState) => void
  rebuildLineMapping: () => void
  // App config (captured from options at init time)
  mode: AppMode
  target: string | undefined
  prInfo: PrInfo | null
}

/**
 * Full refresh - reload everything from scratch (PR data, diff, comments)
 */
export async function handleRefresh(ctx: RefreshContext): Promise<void> {
  const state = ctx.getState()

  // Show loading toast
  ctx.setState((s) => showToast(s, "Refreshing...", "info"))
  ctx.render()

  try {
    if (state.appMode === "pr" && state.prInfo) {
      // PR mode - reload PR data
      const { owner, repo, number: prNumber } = state.prInfo
      const {
        prInfo: newPrInfo,
        diff: newDiff,
        comments: newComments,
        viewedStatuses,
        headSha,
      } = await loadPrSession(prNumber, owner, repo)

      // Parse diff into files
      const newFiles = sortFiles(parseDiff(newDiff))
      const newFileTree = buildFileTree(newFiles)

      // Re-initialize state with new data
      ctx.setState(() => {
        const prevState = ctx.getState()
        const newState = createInitialState(
          newFiles,
          newFileTree,
          prevState.source,
          `#${prNumber}: ${newPrInfo.title}`,
          null, // no error
          prevState.session,
          newComments,
          "pr",
          newPrInfo,
          prevState.ignoreMatcher
        )
        // Set commits from refreshed PR info
        const withCommits = { ...newState, commits: newPrInfo.commits ?? [] }
        // Auto-collapse ignored files
        if (withCommits.ignoredFiles.size > 0) {
          const newCollapsed = new Set(withCommits.collapsedFiles)
          for (const filename of withCommits.ignoredFiles) {
            newCollapsed.add(filename)
          }
          return { ...withCommits, collapsedFiles: newCollapsed }
        }
        return withCommits
      })

      // Collapse resolved threads
      const threads = groupIntoThreads(newComments)
      ctx.setState((s) => collapseResolvedThreads(s, threads))

      // Load file statuses
      const localViewedStatuses = await loadViewedStatuses(state.source)
      ctx.setState((s) => loadFileStatuses(s, localViewedStatuses))

      // Merge GitHub viewed statuses
      if (viewedStatuses && headSha) {
        ctx.setState((s) => {
          const mergedStatuses = new Map(s.fileStatuses)
          for (const [filename, viewed] of viewedStatuses) {
            const existing = mergedStatuses.get(filename)
            if (!existing) {
              mergedStatuses.set(filename, {
                filename,
                viewed,
                viewedAt: viewed ? new Date().toISOString() : undefined,
                viewedAtCommit: viewed ? headSha : undefined,
                githubSynced: true,
                syncedAt: new Date().toISOString(),
              })
            } else {
              mergedStatuses.set(filename, {
                ...existing,
                viewed,
                viewedAt: viewed ? new Date().toISOString() : undefined,
                viewedAtCommit: viewed ? headSha : undefined,
                githubSynced: true,
                syncedAt: new Date().toISOString(),
              })
            }
          }
          return updateFileStatuses(s, mergedStatuses)
        })
      }

      // Collapse viewed files
      ctx.setState((s) => collapseViewedFiles(s))

      // Reset cursor and rebuild line mapping
      ctx.setVimState(createCursorState())
      ctx.rebuildLineMapping()

      // Clear search state
      ctx.setSearchState(createSearchState())

      ctx.setState((s) => showToast(s, "Refreshed", "success"))
    } else {
      // Local mode - reload diff
      const newDiff = await getLocalDiff(ctx.target)
      const newDescription = await getDiffDescription(ctx.target)
      const newComments = await loadComments(state.source)

      const newFiles = sortFiles(parseDiff(newDiff))
      const newFileTree = buildFileTree(newFiles)

      ctx.setState(() => {
        const prevState = ctx.getState()
        const newState = createInitialState(newFiles, newFileTree, prevState.source, newDescription, null, prevState.session, newComments, "local", null, prevState.ignoreMatcher)
        // Auto-collapse ignored files
        if (newState.ignoredFiles.size > 0) {
          const newCollapsed = new Set(newState.collapsedFiles)
          for (const filename of newState.ignoredFiles) {
            newCollapsed.add(filename)
          }
          return { ...newState, collapsedFiles: newCollapsed }
        }
        return newState
      })

      ctx.setVimState(createCursorState())
      ctx.rebuildLineMapping()
      ctx.setSearchState(createSearchState())

      ctx.setState((s) => showToast(s, "Refreshed", "success"))
    }

    ctx.render()

    // Auto-clear toast
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 2000)
  } catch (err) {
    ctx.setState((s) =>
      showToast(s, `Refresh failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
    )
    ctx.render()

    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 4000)
  }
}
