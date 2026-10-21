import type { CliRenderer } from "@opentui/core"
import { createMemo, createRenderEffect, createRoot, untrack, type Accessor } from "solid-js"
import { createToastIsland } from "./notifications"
import { createConfirmDialogIsland } from "./confirm-dialog"
import { createReviewPreviewIsland, type ReviewPreviewIslandOptions } from "./review-preview"
import { createSyncPreviewIsland } from "./sync-preview"
import { createHelpOverlayIsland } from "./help-overlay"
import { createPeekIsland } from "./peek-island"
import { overlayModels, type OverlayModels } from "./overlay-models"
import type { Frame } from "./frame"
import type { AppShell, OverlayId } from "./shell"

export type FrameOverlayId = keyof OverlayModels

const FRAME_OVERLAYS = [
  "toast",
  "confirmDialog",
  "reviewPreview",
  "syncPreview",
  "helpOverlay",
  "diffPeek",
  "blamePeek",
  "hunkPeek",
] as const satisfies readonly (FrameOverlayId & OverlayId)[]

/** The overlays that only show a model, created as both app.ts and the test harness mount them. */
export function createFrameOverlays(renderer: CliRenderer, { onSummaryChange }: ReviewPreviewIslandOptions) {
  return {
    toast: createToastIsland(renderer),
    confirmDialog: createConfirmDialogIsland(renderer),
    reviewPreview: createReviewPreviewIsland(renderer, { onSummaryChange }),
    syncPreview: createSyncPreviewIsland(renderer),
    helpOverlay: createHelpOverlayIsland(renderer),
    diffPeek: createPeekIsland(renderer, { id: "diff-peek-island" }),
    blamePeek: createPeekIsland(renderer, { id: "blame-peek-island" }),
    // Above the comments panel (50), which is what this is drawn over.
    hunkPeek: createPeekIsland(renderer, { id: "hunk-peek-island", zIndex: 60 }),
  }
}

export type FrameOverlays = ReturnType<typeof createFrameOverlays>

type Followers = { [K in FrameOverlayId]: { update(model: OverlayModels[K]): void } }

/**
 * Each overlay draws its model from every published frame and is shown
 * exactly while it has one. Returns the teardown.
 */
export function followFrame(frame: Accessor<Frame | null>, overlays: Followers, shell: Pick<AppShell, "show">): () => void {
  return createRoot((dispose) => {
    const models = createMemo(() => {
      const current = frame()
      return current && overlayModels(current)
    })
    for (const id of FRAME_OVERLAYS) {
      createRenderEffect(() => {
        const current = models()
        if (!current) return
        const model = current[id]
        // Untracked: an island reading its own state while it updates must
        // not subscribe this effect to it.
        untrack(() => (overlays[id].update as (next: typeof model) => void)(model))
        shell.show(id, model !== null)
      })
    }
    return dispose
  })
}
