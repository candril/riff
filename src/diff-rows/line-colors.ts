import type { DiffLineType } from "../vim-diff/types"

export const ADDITION_BG = "#1e3a2f"
export const DELETION_BG = "#3a1e2f"

// A step brighter than the row's own tint, so the cursor line keeps saying which side it is.
export const CURSOR_ADDITION_BG = "#243d32"
export const CURSOR_DELETION_BG = "#3d2432"
export const CURSOR_LINE_BG = "#232330"

export function cursorLineBg(type: DiffLineType | undefined): string {
  if (type === "addition") return CURSOR_ADDITION_BG
  if (type === "deletion") return CURSOR_DELETION_BG
  return CURSOR_LINE_BG
}
