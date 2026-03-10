/**
 * PR Info Panel open handler
 *
 * Handles opening the PR info panel and loading extended PR data.
 */

import type { AppState } from "../../state"
import type { PrInfo } from "../../providers/github"
import type { PRInfoPanelClass } from "../../components"
import { openPRInfoPanel, setPRInfoPanelLoading } from "../../state"
import { getPrExtendedInfo } from "../../providers/github"

export interface PRInfoPanelOpenContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // The PR info panel instance (created by this handler)
  setPanelInstance: (panel: PRInfoPanelClass) => void
  // Factory to create panel instance
  createPanelInstance: (prInfo: PrInfo) => PRInfoPanelClass
}

/**
 * Open the PR info panel (gi) and load extended info
 */
export async function handleOpenPRInfoPanel(ctx: PRInfoPanelOpenContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) {
    return
  }

  const prInfo = state.prInfo
  ctx.setState(openPRInfoPanel)

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

    ctx.setState((s) => ({
      ...s,
      prInfo: updatedPrInfo,
      prInfoPanel: {
        ...s.prInfoPanel,
        loading: false,
      },
    }))

    // Create the panel instance with the updated prInfo
    ctx.setPanelInstance(ctx.createPanelInstance(updatedPrInfo))
    ctx.render()
  } catch {
    // Still show panel with basic info
    ctx.setPanelInstance(ctx.createPanelInstance(state.prInfo))
    ctx.setState((s) => setPRInfoPanelLoading(s, false))
    ctx.render()
  }
}
