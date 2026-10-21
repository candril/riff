import type { PRInfoPanelClass } from "../components/PRInfoPanel"
import type { PrInfoPanelFrameModel } from "./panel-frame-models"

/**
 * Hands the PR info panel each frame's model. The panel is read at every
 * update, never held, because a reload destroys it and builds another.
 */
export function createPrInfoPanelFollower(currentPanel: () => PRInfoPanelClass | null) {
  return {
    update({ flashLabels, filterOpen, filter, commentInput }: PrInfoPanelFrameModel): void {
      const panel = currentPanel()
      if (!panel) return
      panel.setFlashLabels(flashLabels)
      panel.syncFilterInput(filterOpen, filter)
      panel.setFilter(filter)
      panel.updateCommentInput(commentInput.open, commentInput.text, commentInput.loading, commentInput.error)
    },
  }
}
