import type { DiffLineType } from "../vim-diff/types"

export const ADDITION_BG = "#1e3a2f"
export const DELETION_BG = "#3a1e2f"

// A clear step brighter than the row's own tint, so the cursor line stands out and still says which side it is.
export const CURSOR_ADDITION_BG = "#28503c"
export const CURSOR_DELETION_BG = "#502838"
export const CURSOR_LINE_BG = "#2a2b3d"

export function cursorLineBg(type: DiffLineType | undefined): string {
  if (type === "addition") return CURSOR_ADDITION_BG
  if (type === "deletion") return CURSOR_DELETION_BG
  return CURSOR_LINE_BG
}
