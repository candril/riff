/**
 * PR Info Panel open handler
 *
 * Handles opening the PR info panel and loading extended PR data.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github"
import type { DiffFile } from "../../utils/diff-parser"
import type { Comment } from "../../types"
import type { PRInfoPanelClass } from "../../components"
import { openPRInfoPanel, setPRInfoPanelLoading, showToast, clearToast } from "../../state"
import { getPrExtendedInfo } from "../../providers/github"

export interface PRInfoPanelOpenContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // The PR info panel instance (created by this handler)
  setPanelInstance: (panel: PRInfoPanelClass) => void
  // Factory to create panel instance (now also takes files and comments)
  createPanelInstance: (prInfo: PrInfo, files: DiffFile[], comments: Comment[]) => PRInfoPanelClass
}

/**
 * Open the PR info panel (i) and load extended info
 */
export async function handleOpenPRInfoPanel(ctx: PRInfoPanelOpenContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) {
    return
  }

  const prInfo = state.prInfo
  
  // Check if extended info is already loaded (from startup)
  const hasExtendedInfo = prInfo.commits && prInfo.reviews
  
  if (hasExtendedInfo) {
    // Data already loaded - open panel immediately
    ctx.setState(openPRInfoPanel)
    ctx.setPanelInstance(ctx.createPanelInstance(prInfo, state.files, state.comments))
    ctx.render()
    return
  }
  
  // Show loading toast while fetching extended info
  ctx.setState((s) => showToast(openPRInfoPanel(s), "Loading PR info...", "info"))
  ctx.render()

  // Load extended info (commits, reviews) first, then create panel
  try {
    const { owner, repo, number: prNumber } = prInfo
    const extendedInfo = await getPrExtendedInfo(prNumber, owner, repo)

    // Update prInfo with extended data
    const updatedPrInfo = {
      ...prInfo,
      commits: extendedInfo.commits,
      reviews: extendedInfo.reviews,
      requestedReviewers: extendedInfo.requestedReviewers,
    }

    ctx.setState((s) => clearToast({
      ...s,
      prInfo: updatedPrInfo,
      prInfoPanel: {
        ...s.prInfoPanel,
        loading: false,
      },
    }))

    // Create the panel instance with the updated prInfo, files, and comments
    const currentState = ctx.getState()
    ctx.setPanelInstance(ctx.createPanelInstance(updatedPrInfo, currentState.files, currentState.comments))
    ctx.render()
  } catch {
    // Still show panel with basic info
    ctx.setState(clearToast)
    const currentState = ctx.getState()
    ctx.setPanelInstance(ctx.createPanelInstance(state.prInfo, currentState.files, currentState.comments))
    ctx.setState((s) => setPRInfoPanelLoading(s, false))
    ctx.render()
  }
}
