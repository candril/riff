/**
 * Side-panel widths. The narrow target keeps the diff readable on
 * normal terminals; the expanded target (Ctrl-e) gives prose room when
 * the user is actively reading / writing comments. Both cap at a share
 * of the terminal width so very narrow terminals still show some diff.
 */
const PANEL_WIDTH_TARGET = 64
const PANEL_WIDTH_EXPANDED = 96
const PANEL_WIDTH_MIN = 48

export function commentPanelWidth(screenWidth: number, expanded: boolean): number {
  const target = expanded ? PANEL_WIDTH_EXPANDED : PANEL_WIDTH_TARGET
  const cap = Math.floor(screenWidth * (expanded ? 0.7 : 0.5))
  return Math.max(PANEL_WIDTH_MIN, Math.min(target, cap))
}
