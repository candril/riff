import type { CliRenderer } from "@opentui/core"
import { createMemo, createRenderEffect, createRoot, untrack, type Accessor } from "solid-js"
import { createToastIsland } from "./notifications"
import { createConfirmDialogIsland } from "./confirm-dialog"
import { createReviewPreviewIsland, type ReviewPreviewIslandOptions } from "./review-preview"
import { createSyncPreviewIsland } from "./sync-preview"
import { createHelpOverlayIsland } from "./help-overlay"
import { createPeekIsland } from "./peek-island"
import { createHeaderIsland } from "./header"
import { createFlashPromptIsland, createSearchPromptIsland } from "./prompt-line"
import {
  createActionMenuIsland,
  createCommentsPickerIsland,
  createCommitPickerIsland,
  createFilePickerIsland,
  createMarksPickerIsland,
  createOccurrencePickerIsland,
} from "./pickers"
import { FRAME_ISLANDS, frameModels, type FrameIslandId, type FrameModels } from "./frame-models"
import type { Frame } from "./frame"
import { OVERLAYS, type AppShell, type ShellParts } from "./shell"

/** The islands that only draw a model, created as both app.ts and the test harness mount them. */
export function createFrameIslands(renderer: CliRenderer, { onSummaryChange }: ReviewPreviewIslandOptions) {
  return {
    header: createHeaderIsland(renderer),
    searchPrompt: createSearchPromptIsland(renderer),
    flashPrompt: createFlashPromptIsland(renderer),
    toast: createToastIsland(renderer),
    confirmDialog: createConfirmDialogIsland(renderer),
    reviewPreview: createReviewPreviewIsland(renderer, { onSummaryChange }),
    syncPreview: createSyncPreviewIsland(renderer),
    helpOverlay: createHelpOverlayIsland(renderer),
    diffPeek: createPeekIsland(renderer, { id: "diff-peek-island" }),
    blamePeek: createPeekIsland(renderer, { id: "blame-peek-island" }),
    // Above the comments panel (50), which is what this is drawn over.
    hunkPeek: createPeekIsland(renderer, { id: "hunk-peek-island", zIndex: 60 }),
    filePicker: createFilePickerIsland(renderer),
    commentsPicker: createCommentsPickerIsland(renderer),
    marksPicker: createMarksPickerIsland(renderer),
    occurrencePicker: createOccurrencePickerIsland(renderer),
    commitPicker: createCommitPickerIsland(renderer),
    actionMenu: createActionMenuIsland(renderer),
  }
}

export type FrameIslands = ReturnType<typeof createFrameIslands>

/** Where the shell mounts each frame island's host. */
export function frameIslandHosts(islands: FrameIslands) {
  const overlays = {} as ShellParts["overlays"]
  for (const id of OVERLAYS) overlays[id] = islands[id].host
  return {
    header: islands.header.host,
    searchPrompt: islands.searchPrompt.host,
    flashPrompt: islands.flashPrompt.host,
    overlays,
  }
}

type Followers = { [K in FrameIslandId]: { update(model: FrameModels[K]): void } }

/**
 * Each island draws its model from every published frame, and all but the
 * header are shown exactly while they have one. Returns the teardown.
 *
 * The effects run inside publish only because render() is never called
 * within a Solid batch or update: the review preview focuses its summary as
 * it opens, and that has to land after render.ts has routed the prompts and
 * the chat their focus.
 */
export function followFrame(frame: Accessor<Frame | null>, islands: Followers, shell: Pick<AppShell, "show">): () => void {
  return createRoot((dispose) => {
    const models = createMemo(() => {
      const current = frame()
      return current && frameModels(current)
    })
    for (const id of FRAME_ISLANDS) {
      createRenderEffect(() => {
        const current = models()
        if (!current) return
        const model = current[id]
        // Untracked: an island reading its own state while it updates must
        // not subscribe this effect to it.
        untrack(() => (islands[id].update as (next: typeof model) => void)(model))
        if (id !== "header") shell.show(id, model !== null)
      })
    }
    return dispose
  })
}
