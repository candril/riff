import type { AppState } from "../state"

export type ViewSlot = "error" | "overview" | "feed" | "empty" | "diff"

/**
 * What the content row shows beside the tree, and whether the tree is
 * there at all. The tree has nothing to list without files, whatever the view.
 */
export function viewSlotOf(
  state: Pick<AppState, "error" | "viewMode" | "files">,
  { overview }: { overview: boolean }
): { slot: ViewSlot; withTree: boolean } {
  const hasFiles = state.files.length > 0
  if (state.error) return { slot: "error", withTree: false }
  // PR overview (spec 041): the panel mounts inline next to the tree; local mode has none.
  if (state.viewMode === "state" && overview) return { slot: "overview", withTree: hasFiles }
  if (state.viewMode === "feed") return { slot: "feed", withTree: hasFiles }
  if (!hasFiles) return { slot: "empty", withTree: false }
  return { slot: "diff", withTree: true }
}
